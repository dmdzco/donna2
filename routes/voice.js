import { Router } from 'express';
import twilio from 'twilio';
import { seniorService } from '../services/seniors.js';
import { memoryService } from '../services/memory.js';
import { conversationService } from '../services/conversations.js';
import { schedulerService } from '../services/scheduler.js';
import { validateTwilioWebhook } from '../middleware/twilio.js';

const router = Router();

// Twilio webhook - incoming/outgoing call answered
router.post('/voice/answer', validateTwilioWebhook, async (req, res) => {
  const callSid = req.body.CallSid;
  const WS_URL = req.app.get('wsUrl');
  const callMetadata = req.app.get('callMetadata');

  // For outbound calls: From = Twilio number, To = person being called
  // For inbound calls: From = caller, To = Twilio number
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
  const isOutbound = req.body.From === twilioNumber || req.body.Direction === 'outbound-api';
  const fromPhone = isOutbound ? req.body.To : req.body.From;
  console.log(`[${callSid}] Call answered (${isOutbound ? 'outbound' : 'inbound'}) - target: ${fromPhone}`);

  // Check if this call was triggered by a reminder (context is PRE-FETCHED)
  const reminderContext = schedulerService.getReminderContext(callSid);

  // Check if we have pre-fetched context for manual outbound call
  const prefetchedContext = schedulerService.getPrefetchedContext(fromPhone);

  let senior = null;
  let memoryContext = null;
  let reminderPrompt = null;
  let preGeneratedGreeting = null;

  if (reminderContext) {
    // REMINDER CALL: Use pre-fetched context (no lag!)
    console.log(`[${callSid}] Reminder call with pre-fetched context: "${reminderContext.reminder.title}"`);
    senior = reminderContext.senior;
    memoryContext = reminderContext.memoryContext;
    reminderPrompt = reminderContext.reminderPrompt;
  } else if (prefetchedContext) {
    // MANUAL OUTBOUND: Use pre-fetched context
    console.log(`[${callSid}] Manual call with pre-fetched context (greeting: ${prefetchedContext.preGeneratedGreeting ? 'ready' : 'none'})`);
    senior = prefetchedContext.senior;
    memoryContext = prefetchedContext.memoryContext;
    preGeneratedGreeting = prefetchedContext.preGeneratedGreeting;
  } else {
    // INBOUND CALL: Fetch context now (can't pre-fetch unknown callers)
    try {
      senior = await seniorService.findByPhone(fromPhone);
      if (senior) {
        console.log(`[${callSid}] Inbound call from ${senior.name}, fetching context...`);
        memoryContext = await memoryService.buildContext(senior.id, null, senior);
      } else {
        console.log(`[${callSid}] Unknown caller, no senior profile found`);
      }
    } catch (error) {
      console.error(`[${callSid}] Error looking up senior:`, error);
    }
  }

  if (memoryContext) {
    console.log(`[${callSid}] Memory context ready (${memoryContext.length} chars)`);
  }

  // Create conversation record in database
  let conversationId = null;
  if (senior) {
    try {
      const conversation = await conversationService.create({
        seniorId: senior.id,
        callSid,
        startedAt: new Date(),
      });
      conversationId = conversation.id;
    } catch (error) {
      console.error(`[${callSid}] Error creating conversation record:`, error);
    }
  }

  console.log(`[${callSid}] Using V1 pipeline (Claude + Conversation Director)`);

  // Store metadata for when WebSocket connects
  callMetadata.set(callSid, { senior, memoryContext, fromPhone, conversationId, reminderPrompt, preGeneratedGreeting });

  const twiml = new twilio.twiml.VoiceResponse();

  // Connect to bidirectional media stream
  const connect = twiml.connect();
  connect.stream({
    url: `${WS_URL}/media-stream`,
    name: 'donna-stream'
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

// Twilio status callback
router.post('/voice/status', validateTwilioWebhook, async (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  console.log(`Call ${CallSid}: ${CallStatus} (${CallDuration || 0}s)`);

  const sessions = req.app.get('sessions');
  const callMetadata = req.app.get('callMetadata');

  // Respond immediately to Twilio
  res.sendStatus(200);

  // Handle session cleanup async (including memory extraction)
  if (['completed', 'failed', 'busy', 'no-answer'].includes(CallStatus)) {
    const session = sessions.get(CallSid);
    const metadata = callMetadata.get(CallSid);

    if (session) {
      try {
        // Get transcript before closing
        const transcript = session.getConversationLog();

        await session.close(); // This now extracts memories

        // Save conversation to database
        if (metadata?.conversationId || metadata?.senior?.id) {
          try {
            await conversationService.complete(CallSid, {
              durationSeconds: parseInt(CallDuration) || 0,
              status: CallStatus,
              transcript: transcript,
            });
          } catch (error) {
            console.error(`[${CallSid}] Error saving conversation:`, error);
          }
        }
      } catch (error) {
        console.error(`[${CallSid}] Error closing session:`, error);
      }
      sessions.delete(CallSid);
    }
    // Clean up metadata and reminder context
    callMetadata.delete(CallSid);
    schedulerService.clearReminderContext(CallSid);
  }
});

export default router;
