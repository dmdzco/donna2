import { Router } from 'express';
import twilio from 'twilio';
import { db } from '../db/client.js';
import { AppError } from '../middleware/error-handler.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { callService } from '../services/call-service.js';

const VoiceResponse = twilio.twiml.VoiceResponse;

export const voiceRouter = Router();

// Initiate a call to a senior (authenticated)
voiceRouter.post('/call/:seniorId', authenticate, async (req: AuthRequest, res, next) => {
  try {
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

    res.json({
      success: true,
      callSid: call.sid,
      status: call.status,
    });
  } catch (error) {
    next(error);
  }
});

// Twilio webhook - called when call connects
voiceRouter.post('/connect', async (req, res) => {
  const response = new VoiceResponse();

  // Initial greeting
  response.say(
    {
      voice: 'Polly.Joanna',
      language: 'en-US',
    },
    'Hello! This is Donna calling. How are you doing today?'
  );

  // Connect to media stream for real-time audio
  const connect = response.connect();
  connect.stream({
    url: `wss://${process.env.API_URL?.replace(/^https?:\/\//, '')}/api/voice/stream`,
    track: 'both_tracks',
  });

  res.type('text/xml');
  res.send(response.toString());
});

// Twilio webhook - call status updates
voiceRouter.post('/status', async (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;

  try {
    if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'no-answer') {
      await db.query(
        `UPDATE conversations
         SET status = $1, ended_at = NOW(), duration_seconds = $2
         WHERE call_sid = $3`,
        [CallStatus.replace('-', '_'), CallDuration || 0, CallSid]
      );
    }
  } catch (error) {
    console.error('Error updating call status:', error);
  }

  res.sendStatus(200);
});

// Twilio webhook - recording completed
voiceRouter.post('/recording', async (req, res) => {
  const { CallSid, RecordingUrl } = req.body;

  try {
    await db.query(
      `UPDATE conversations SET audio_url = $1 WHERE call_sid = $2`,
      [RecordingUrl, CallSid]
    );
  } catch (error) {
    console.error('Error saving recording URL:', error);
  }

  res.sendStatus(200);
});
