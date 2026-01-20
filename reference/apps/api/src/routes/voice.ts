import { Router } from 'express';
import twilio from 'twilio';
import { db } from '../db/client.js';
import { AppError } from '../middleware/error-handler.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { callService } from '../services/call-service.js';
import { loggers, withContext } from '@donna/logger';
import { eventBus, createCallConnectedEvent, createCallEndedEvent } from '@donna/event-bus';

const log = loggers.api;
const VoiceResponse = twilio.twiml.VoiceResponse;

export const voiceRouter = Router();

// Initiate a call to a senior (authenticated)
voiceRouter.post('/call/:seniorId', authenticate, async (req: AuthRequest, res, next) => {
  const callLog = withContext({
    service: 'voice-routes',
    seniorId: req.params.seniorId,
    caregiverId: req.caregiverId,
  });

  try {
    callLog.info('Initiating call to senior');

    // Verify senior belongs to caregiver
    const seniorResult = await db.query(
      'SELECT * FROM seniors WHERE id = $1 AND caregiver_id = $2',
      [req.params.seniorId, req.caregiverId]
    );

    if (seniorResult.rows.length === 0) {
      throw new AppError(404, 'Senior not found');
    }

    const senior = seniorResult.rows[0];

    // Get active reminders to potentially deliver
    const remindersResult = await db.query(
      `SELECT * FROM reminders WHERE senior_id = $1 AND is_active = true`,
      [senior.id]
    );

    const call = await callService.initiateCall(senior, remindersResult.rows);

    callLog.info({ callSid: call.sid, status: call.status }, 'Call initiated successfully');

    res.json({
      success: true,
      callSid: call.sid,
      status: call.status,
    });
  } catch (error) {
    callLog.error({ error: (error as Error).message }, 'Failed to initiate call');
    next(error);
  }
});

// Twilio webhook - called when call connects
voiceRouter.post('/connect', async (req, res) => {
  const response = new VoiceResponse();

  // Get personalized context from query params
  const seniorName = req.query.seniorName as string || 'there';
  const conversationId = req.query.conversationId as string;

  // Start media stream IMMEDIATELY for faster response after greeting
  // Using <Start><Stream> runs in parallel with <Say>, reducing latency
  const start = response.start();
  start.stream({
    url: `wss://${process.env.API_URL?.replace(/^https?:\/\//, '')}/api/voice/stream`,
    track: 'both_tracks',
    name: conversationId || 'donna-stream',
  });

  // Personalized, elderly-friendly greeting
  // Using Polly.Joanna-Neural for warmer, more natural voice
  // Speaking slowly and clearly with their name for recognition
  response.say(
    {
      voice: 'Polly.Joanna-Neural',
      language: 'en-US',
    },
    `<speak>
      <prosody rate="90%" pitch="-5%">
        Hello ${seniorName}! <break time="300ms"/>
        This is Donna. <break time="200ms"/>
        How are you doing today?
      </prosody>
    </speak>`
  );

  // Keep the call open for bidirectional conversation
  response.pause({ length: 60 });

  res.type('text/xml');
  res.send(response.toString());
});

// Twilio webhook - call status updates
voiceRouter.post('/status', async (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;

  const statusLog = withContext({
    service: 'voice-routes',
    callId: CallSid, // Using callSid as callId for context
  });

  statusLog.info({ status: CallStatus, duration: CallDuration }, 'Call status update received');

  try {
    // Get conversation details for event emission
    const convResult = await db.query(
      'SELECT id, senior_id FROM conversations WHERE call_sid = $1',
      [CallSid]
    );
    const conversation = convResult.rows[0];

    if (CallStatus === 'answered' && conversation) {
      // Emit call connected event
      eventBus.emit(createCallConnectedEvent({
        callId: conversation.id,
        callSid: CallSid,
        seniorId: conversation.senior_id,
      }));
      statusLog.info('Call connected - senior answered');
    }

    if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'no-answer') {
      await db.query(
        `UPDATE conversations
         SET status = $1, ended_at = NOW(), duration_seconds = $2
         WHERE call_sid = $3`,
        [CallStatus.replace('-', '_'), CallDuration || 0, CallSid]
      );

      // Emit call ended event
      if (conversation) {
        const reason = CallStatus === 'completed' ? 'completed'
          : CallStatus === 'no-answer' ? 'no_answer'
          : 'failed';

        eventBus.emit(createCallEndedEvent({
          callId: conversation.id,
          callSid: CallSid,
          seniorId: conversation.senior_id,
          durationSeconds: parseInt(CallDuration) || 0,
          reason,
        }));
        statusLog.info({ reason, duration: CallDuration }, 'Call ended');
      }
    }
  } catch (error) {
    statusLog.error({ error: (error as Error).message }, 'Error updating call status');
  }

  res.sendStatus(200);
});

// Twilio webhook - recording completed
voiceRouter.post('/recording', async (req, res) => {
  const { CallSid, RecordingUrl } = req.body;

  const recordingLog = withContext({
    service: 'voice-routes',
    callId: CallSid, // Using callSid as callId for context
  });

  recordingLog.info({ recordingUrl: RecordingUrl }, 'Recording completed');

  try {
    await db.query(
      `UPDATE conversations SET audio_url = $1 WHERE call_sid = $2`,
      [RecordingUrl, CallSid]
    );
    recordingLog.info('Recording URL saved to conversation');
  } catch (error) {
    recordingLog.error({ error: (error as Error).message }, 'Error saving recording URL');
  }

  res.sendStatus(200);
});
