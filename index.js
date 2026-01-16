import express from 'express';
import twilio from 'twilio';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GeminiLiveSession } from './gemini-live.js';
import { seniorService } from './services/seniors.js';
import { memoryService } from './services/memory.js';
import { conversationService } from './services/conversations.js';
import { schedulerService, startScheduler } from './services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files (admin UI)
app.use(express.static(join(__dirname, 'public')));

const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://localhost:${PORT}`;
const WS_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `wss://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `ws://localhost:${PORT}`;

// Initialize Twilio client for outbound calls
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Store active sessions
const sessions = new Map();

// Store call metadata (phone number, senior info)
const callMetadata = new Map();

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    milestone: 7,
    activeSessions: sessions.size,
    ai: 'gemini-2.5-flash-native-audio',
    features: ['news-updates', 'scheduled-calls']
  });
});

// Twilio webhook - incoming/outgoing call answered
app.post('/voice/answer', async (req, res) => {
  const callSid = req.body.CallSid;
  const fromPhone = req.body.From || req.body.To; // From for inbound, To for outbound
  console.log(`[${callSid}] Call answered from ${fromPhone}, starting media stream`);

  // Check if this call was triggered by a reminder
  const reminderContext = schedulerService.getReminderContext(callSid);
  let reminderPrompt = null;
  if (reminderContext) {
    console.log(`[${callSid}] This is a reminder call: "${reminderContext.reminder.title}"`);
    reminderPrompt = schedulerService.formatReminderPrompt(reminderContext.reminder);
  }

  // Look up senior by phone number
  let senior = null;
  let memoryContext = null;

  try {
    // If reminder call, we already have the senior
    senior = reminderContext?.senior || await seniorService.findByPhone(fromPhone);
    if (senior) {
      console.log(`[${callSid}] Found senior: ${senior.name} (${senior.id})`);
      memoryContext = await memoryService.buildContext(senior.id, null, senior);
      if (memoryContext) {
        console.log(`[${callSid}] Built memory context (${memoryContext.length} chars)`);
      }
    } else {
      console.log(`[${callSid}] Unknown caller, no senior profile found`);
    }
  } catch (error) {
    console.error(`[${callSid}] Error looking up senior:`, error);
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

  // Store metadata for when WebSocket connects
  callMetadata.set(callSid, { senior, memoryContext, fromPhone, conversationId, reminderPrompt });

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
app.post('/voice/status', async (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  console.log(`Call ${CallSid}: ${CallStatus} (${CallDuration || 0}s)`);

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

// API: Initiate outbound call
app.post('/api/call', async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: 'phoneNumber required' });
  }

  try {
    const call = await twilioClient.calls.create({
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${BASE_URL}/voice/answer`,
      statusCallback: `${BASE_URL}/voice/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });

    console.log(`Initiated call ${call.sid} to ${phoneNumber}`);
    res.json({ success: true, callSid: call.sid });

  } catch (error) {
    console.error('Failed to initiate call:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: List active calls
app.get('/api/calls', (req, res) => {
  res.json({
    activeCalls: sessions.size,
    callSids: Array.from(sessions.keys()),
  });
});

// API: End a call
app.post('/api/calls/:callSid/end', async (req, res) => {
  try {
    await twilioClient.calls(req.params.callSid).update({ status: 'completed' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === SENIOR MANAGEMENT APIs ===

// Create a senior profile
app.post('/api/seniors', async (req, res) => {
  try {
    const senior = await seniorService.create(req.body);
    res.json(senior);
  } catch (error) {
    console.error('Failed to create senior:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all seniors
app.get('/api/seniors', async (req, res) => {
  try {
    const seniors = await seniorService.list();
    res.json(seniors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get senior by ID
app.get('/api/seniors/:id', async (req, res) => {
  try {
    const senior = await seniorService.getById(req.params.id);
    if (!senior) {
      return res.status(404).json({ error: 'Senior not found' });
    }
    res.json(senior);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update senior
app.patch('/api/seniors/:id', async (req, res) => {
  try {
    const senior = await seniorService.update(req.params.id, req.body);
    res.json(senior);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === MEMORY APIs ===

// Store a memory for a senior
app.post('/api/seniors/:id/memories', async (req, res) => {
  const { type, content, importance } = req.body;
  try {
    const memory = await memoryService.store(
      req.params.id,
      type || 'fact',
      content,
      'manual',
      importance || 50
    );
    res.json(memory);
  } catch (error) {
    console.error('Failed to store memory:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search memories for a senior
app.get('/api/seniors/:id/memories/search', async (req, res) => {
  const { q, limit } = req.query;
  try {
    const memories = await memoryService.search(
      req.params.id,
      q,
      parseInt(limit) || 5
    );
    res.json(memories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recent memories for a senior
app.get('/api/seniors/:id/memories', async (req, res) => {
  try {
    const memories = await memoryService.getRecent(req.params.id, 20);
    res.json(memories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === CONVERSATION APIs ===

// Get conversations for a senior
app.get('/api/seniors/:id/conversations', async (req, res) => {
  try {
    const convos = await conversationService.getForSenior(req.params.id, 20);
    res.json(convos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all recent conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const convos = await conversationService.getRecent(50);
    res.json(convos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create HTTP server
const server = createServer(app);

// Create WebSocket server for Twilio Media Streams
const wss = new WebSocketServer({ server, path: '/media-stream' });

wss.on('connection', async (twilioWs, req) => {
  console.log('New WebSocket connection from Twilio');

  let streamSid = null;
  let callSid = null;
  let geminiSession = null;

  twilioWs.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.event) {
        case 'connected':
          console.log('Twilio media stream connected');
          break;

        case 'start':
          streamSid = data.start.streamSid;
          callSid = data.start.callSid;
          console.log(`[${callSid}] Stream started: ${streamSid}`);

          // Get metadata stored during /voice/answer
          const metadata = callMetadata.get(callSid) || {};

          // Create and connect Gemini Live session with senior context
          geminiSession = new GeminiLiveSession(
            twilioWs,
            streamSid,
            metadata.senior,
            metadata.memoryContext,
            metadata.reminderPrompt
          );
          sessions.set(callSid, geminiSession);

          try {
            await geminiSession.connect();
          } catch (error) {
            console.error(`[${callSid}] Failed to start Gemini session:`, error);
          }
          break;

        case 'media':
          // Forward audio to Gemini
          if (geminiSession && data.media?.payload) {
            geminiSession.sendAudio(data.media.payload);
          }
          break;

        case 'stop':
          console.log(`[${callSid}] Stream stopped`);
          // Don't close here - let status callback handle it for proper memory extraction
          break;
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });

  twilioWs.on('close', async () => {
    console.log(`[${callSid}] WebSocket closed`);
    // Close session if still in sessions map (status callback may have already handled it)
    if (geminiSession && sessions.has(callSid)) {
      try {
        await geminiSession.close();
      } catch (error) {
        console.error(`[${callSid}] Error closing session on WS close:`, error);
      }
      sessions.delete(callSid);
    }
  });

  twilioWs.on('error', (error) => {
    console.error(`[${callSid}] WebSocket error:`, error);
  });
});

server.listen(PORT, () => {
  console.log(`Donna listening on port ${PORT}`);
  console.log(`Voice webhook: ${BASE_URL}/voice/answer`);
  console.log(`Media stream: ${WS_URL}/media-stream`);
  console.log(`Milestone: 7 (Phase C - Scheduled Calls)`);

  // Start the reminder scheduler (check every minute)
  startScheduler(BASE_URL, 60000);
});
