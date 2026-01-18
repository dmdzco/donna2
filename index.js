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
import { BrowserSession } from './browser-session.js';
import { parse as parseUrl } from 'url';

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
    features: ['news-updates', 'scheduled-calls', 'browser-calling']
  });
});

// Twilio webhook - incoming/outgoing call answered
app.post('/voice/answer', async (req, res) => {
  const callSid = req.body.CallSid;
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

  if (reminderContext) {
    // REMINDER CALL: Use pre-fetched context (no lag!)
    console.log(`[${callSid}] Reminder call with pre-fetched context: "${reminderContext.reminder.title}"`);
    senior = reminderContext.senior;
    memoryContext = reminderContext.memoryContext;
    reminderPrompt = reminderContext.reminderPrompt;
  } else if (prefetchedContext) {
    // MANUAL OUTBOUND: Use pre-fetched context
    console.log(`[${callSid}] Manual call with pre-fetched context`);
    senior = prefetchedContext.senior;
    memoryContext = prefetchedContext.memoryContext;
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

  // Store metadata for when WebSocket connects
  callMetadata.set(callSid, { senior, memoryContext, fromPhone, conversationId, reminderPrompt });

  const twiml = new twilio.twiml.VoiceResponse();

  // Brief pause to let connection establish
  twiml.pause({ length: 1 });

  // Connect to bidirectional media stream
  const connect = twiml.connect();
  connect.stream({
    url: `${WS_URL}/media-stream`,
    name: 'donna-stream'
  });

  const twimlStr = twiml.toString();
  console.log(`[${callSid}] TwiML: ${twimlStr}`);
  res.type('text/xml');
  res.send(twimlStr);
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
    // PRE-FETCH: Look up senior and build context BEFORE calling Twilio
    const senior = await seniorService.findByPhone(phoneNumber);
    if (senior) {
      await schedulerService.prefetchForPhone(phoneNumber, senior);
    }

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

// Debug: log all media-stream requests
app.all('/media-stream', (req, res, next) => {
  console.log(`[HTTP] /media-stream request: ${req.method}, upgrade: ${req.headers.upgrade}`);
  next();
});

// Create HTTP server
const server = createServer(app);

// Create WebSocket server for Twilio Media Streams
const wss = new WebSocketServer({ noServer: true });

wss.on('error', (error) => {
  console.error('[WSS] Server error:', error);
});

wss.on('connection', async (twilioWs, req) => {
  console.log('New WebSocket connection from Twilio');
  console.log(`[WS] Ready state: ${twilioWs.readyState}, URL: ${req.url}`);
  console.log(`[WS] Headers: ${JSON.stringify(req.headers)}`);

  // Immediately send a pong to acknowledge connection
  try {
    twilioWs.pong();
    console.log('[WS] Sent pong');
  } catch (e) {
    console.log('[WS] Pong error:', e.message);
  }

  // Send a ping to keep connection alive
  const pingInterval = setInterval(() => {
    if (twilioWs.readyState === 1) {
      twilioWs.ping();
    }
  }, 5000); // More frequent pings

  let streamSid = null;
  let callSid = null;
  let geminiSession = null;

  twilioWs.on('message', async (message, isBinary) => {
    console.log(`[WS] Message received (binary: ${isBinary}, length: ${message.length})`);
    console.log(`[WS] Raw: ${message.toString().substring(0, 200)}`);
    const event = JSON.parse(message).event;
    console.log(`[WS] Event: ${event}`);
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

  twilioWs.on('close', async (code, reason) => {
    console.log(`[${callSid}] WebSocket closed - code: ${code}, reason: ${reason?.toString() || 'none'}`);
    clearInterval(pingInterval);
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
    console.error(`[${callSid}] WebSocket error:`, error.message, error.code, error.stack);
  });

  twilioWs.on('ping', () => {
    console.log(`[${callSid}] Received ping`);
  });

  twilioWs.on('pong', () => {
    console.log(`[${callSid}] Received pong`);
  });

  twilioWs.on('unexpected-response', (req, res) => {
    console.log(`[${callSid}] Unexpected response:`, res.statusCode);
  });
});

// === BROWSER CALL WebSocket ===
const browserWss = new WebSocketServer({ noServer: true });

browserWss.on('connection', async (browserWs, req) => {
  console.log('[Browser] New browser call connection');

  // Parse query params for seniorId
  const { query } = parseUrl(req.url, true);
  const seniorId = query.seniorId;

  let senior = null;
  let memoryContext = null;
  let browserSession = null;

  // Pre-fetch senior context
  if (seniorId) {
    try {
      senior = await seniorService.getById(seniorId);
      if (senior) {
        console.log(`[Browser] Found senior: ${senior.name}`);
        memoryContext = await memoryService.buildContext(senior.id, null, senior);
      }
    } catch (error) {
      console.error('[Browser] Error fetching senior:', error);
    }
  }

  // Create browser session
  browserSession = new BrowserSession(browserWs, senior, memoryContext);

  try {
    await browserSession.connect();
  } catch (error) {
    console.error('[Browser] Failed to start session:', error);
    browserWs.close();
    return;
  }

  // Handle incoming audio from browser
  browserWs.on('message', (message) => {
    if (Buffer.isBuffer(message) || message instanceof ArrayBuffer) {
      browserSession.sendAudio(message);
    }
  });

  browserWs.on('close', async () => {
    console.log('[Browser] Connection closed');
    if (browserSession) {
      await browserSession.close();
    }
  });

  browserWs.on('error', (error) => {
    console.error('[Browser] WebSocket error:', error);
  });
});

// Handle WebSocket upgrade manually for both servers
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  console.log(`[Upgrade] Path: ${pathname}`);

  if (pathname === '/media-stream') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log('[Upgrade] WebSocket upgraded for media-stream');
      wss.emit('connection', ws, request);
    });
  } else if (pathname === '/browser-call') {
    browserWss.handleUpgrade(request, socket, head, (ws) => {
      console.log('[Upgrade] WebSocket upgraded for browser-call');
      browserWss.emit('connection', ws, request);
    });
  } else {
    console.log(`[Upgrade] Unknown path: ${pathname}, destroying socket`);
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Donna listening on port ${PORT}`);
  console.log(`Voice webhook: ${BASE_URL}/voice/answer`);
  console.log(`Media stream: ${WS_URL}/media-stream`);
  console.log(`Browser call: ${WS_URL}/browser-call`);
  console.log(`Milestone: 7 (Phase C - Scheduled Calls)`);

  // Start the reminder scheduler (check every minute)
  startScheduler(BASE_URL, 60000);
});
