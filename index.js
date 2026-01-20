import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import twilio from 'twilio';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// V0 imports commented out - preparing for removal
// import { GeminiLiveSession } from './gemini-live.js';
import { V1AdvancedSession } from './pipelines/v1-advanced.js';
import { seniorService } from './services/seniors.js';
import { memoryService } from './services/memory.js';
import { conversationService } from './services/conversations.js';
import { schedulerService, startScheduler } from './services/scheduler.js';
// import { BrowserSession } from './browser-session.js';
import { parse as parseUrl } from 'url';
import { db } from './db/client.js';
import { reminders, seniors, conversations } from './db/schema.js';
import { eq, desc, gte, and, sql } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// CORS - allow admin dashboard, observability, and local development
app.use(cors({
  origin: [
    'https://donna-admin.vercel.app',
    'https://observability-production-3677.up.railway.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5174',
  ],
  credentials: true,
}));

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
    version: '3.0',
    activeSessions: sessions.size,
    pipeline: 'claude-streaming + 4-layer-observer + elevenlabs',
    features: ['dynamic-model-routing', 'post-turn-agent', 'streaming-tts'],
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

  // V1 is now the only pipeline (V0 Gemini removed)
  const pipeline = 'v1';
  pendingPipelines.delete(callSid); // Clean up

  console.log(`[${callSid}] Using pipeline: v1 (Claude + 4-layer observer)`);

  // Store metadata for when WebSocket connects
  callMetadata.set(callSid, { senior, memoryContext, fromPhone, conversationId, reminderPrompt, pipeline });

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

// Store pipeline preference for pending calls (callSid -> pipeline)
const pendingPipelines = new Map();

// API: Initiate outbound call
app.post('/api/call', async (req, res) => {
  const { phoneNumber } = req.body;
  // Note: 'pipeline' param ignored - V1 is now the only pipeline

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

    // V1 is the only pipeline now
    pendingPipelines.set(call.sid, 'v1');

    console.log(`Initiated v1 call ${call.sid} to ${phoneNumber}`);
    res.json({ success: true, callSid: call.sid, pipeline: 'v1' });

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

// === REMINDER APIs ===

// List all reminders with senior info
app.get('/api/reminders', async (req, res) => {
  try {
    const result = await db.select({
      id: reminders.id,
      seniorId: reminders.seniorId,
      seniorName: seniors.name,
      type: reminders.type,
      title: reminders.title,
      description: reminders.description,
      scheduledTime: reminders.scheduledTime,
      isRecurring: reminders.isRecurring,
      cronExpression: reminders.cronExpression,
      isActive: reminders.isActive,
      lastDeliveredAt: reminders.lastDeliveredAt,
      createdAt: reminders.createdAt,
    })
    .from(reminders)
    .leftJoin(seniors, eq(reminders.seniorId, seniors.id))
    .where(eq(reminders.isActive, true))
    .orderBy(desc(reminders.createdAt));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a reminder
app.post('/api/reminders', async (req, res) => {
  try {
    const { seniorId, type, title, description, scheduledTime, isRecurring, cronExpression } = req.body;
    const [reminder] = await db.insert(reminders).values({
      seniorId,
      type: type || 'custom',
      title,
      description,
      scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
      isRecurring: isRecurring || false,
      cronExpression,
    }).returning();
    res.json(reminder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a reminder
app.patch('/api/reminders/:id', async (req, res) => {
  try {
    const { title, description, scheduledTime, isRecurring, cronExpression, isActive } = req.body;
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (scheduledTime !== undefined) updateData.scheduledTime = new Date(scheduledTime);
    if (isRecurring !== undefined) updateData.isRecurring = isRecurring;
    if (cronExpression !== undefined) updateData.cronExpression = cronExpression;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [reminder] = await db.update(reminders)
      .set(updateData)
      .where(eq(reminders.id, req.params.id))
      .returning();
    res.json(reminder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a reminder
app.delete('/api/reminders/:id', async (req, res) => {
  try {
    await db.delete(reminders).where(eq(reminders.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === STATS API ===

// Dashboard statistics
app.get('/api/stats', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Total active seniors
    const [{ count: totalSeniors }] = await db.select({ count: sql`count(*)` })
      .from(seniors)
      .where(eq(seniors.isActive, true));

    // Calls today
    const [{ count: callsToday }] = await db.select({ count: sql`count(*)` })
      .from(conversations)
      .where(gte(conversations.startedAt, startOfDay));

    // Upcoming reminders (next 24 hours)
    const upcomingReminders = await db.select({
      id: reminders.id,
      title: reminders.title,
      type: reminders.type,
      scheduledTime: reminders.scheduledTime,
      seniorName: seniors.name,
    })
    .from(reminders)
    .leftJoin(seniors, eq(reminders.seniorId, seniors.id))
    .where(and(
      eq(reminders.isActive, true),
      gte(reminders.scheduledTime, now),
    ))
    .orderBy(reminders.scheduledTime)
    .limit(10);

    // Recent calls (last 5)
    const recentCalls = await db.select({
      id: conversations.id,
      seniorName: seniors.name,
      startedAt: conversations.startedAt,
      durationSeconds: conversations.durationSeconds,
      status: conversations.status,
    })
    .from(conversations)
    .leftJoin(seniors, eq(conversations.seniorId, seniors.id))
    .orderBy(desc(conversations.startedAt))
    .limit(5);

    res.json({
      totalSeniors: parseInt(totalSeniors) || 0,
      callsToday: parseInt(callsToday) || 0,
      upcomingRemindersCount: upcomingReminders.length,
      activeCalls: sessions.size,
      upcomingReminders,
      recentCalls,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === OBSERVABILITY API ===

// Get recent calls for observability dashboard
app.get('/api/observability/calls', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const calls = await db.select({
      id: conversations.id,
      callSid: conversations.callSid,
      seniorId: conversations.seniorId,
      seniorName: seniors.name,
      seniorPhone: seniors.phone,
      startedAt: conversations.startedAt,
      endedAt: conversations.endedAt,
      durationSeconds: conversations.durationSeconds,
      status: conversations.status,
      summary: conversations.summary,
      sentiment: conversations.sentiment,
      concerns: conversations.concerns,
    })
    .from(conversations)
    .leftJoin(seniors, eq(conversations.seniorId, seniors.id))
    .orderBy(desc(conversations.startedAt))
    .limit(limit);

    // Transform to match dashboard expected format
    const formattedCalls = calls.map(call => ({
      id: call.id,
      call_sid: call.callSid,
      senior_id: call.seniorId,
      senior_name: call.seniorName,
      senior_phone: call.seniorPhone,
      started_at: call.startedAt,
      ended_at: call.endedAt,
      duration_seconds: call.durationSeconds,
      status: call.status || 'completed',
      summary: call.summary,
      sentiment: call.sentiment,
      concerns: call.concerns,
      turn_count: 0, // Will be populated from transcript if available
    }));

    res.json({ calls: formattedCalls });
  } catch (error) {
    console.error('Error fetching calls:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get active calls
app.get('/api/observability/active', async (req, res) => {
  try {
    const activeCalls = [];
    for (const [callSid, session] of sessions.entries()) {
      const metadata = callMetadata.get(callSid);
      if (metadata) {
        activeCalls.push({
          id: callSid,
          call_sid: callSid,
          senior_id: metadata.senior?.id,
          senior_name: metadata.senior?.name || 'Unknown',
          senior_phone: metadata.senior?.phone || 'Unknown',
          started_at: metadata.startedAt || new Date().toISOString(),
          status: 'in_progress',
          turn_count: session.turnCount || 0,
        });
      }
    }
    res.json({ activeCalls });
  } catch (error) {
    console.error('Error fetching active calls:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get call details by ID
app.get('/api/observability/calls/:id', async (req, res) => {
  try {
    const [call] = await db.select({
      id: conversations.id,
      callSid: conversations.callSid,
      seniorId: conversations.seniorId,
      seniorName: seniors.name,
      seniorPhone: seniors.phone,
      startedAt: conversations.startedAt,
      endedAt: conversations.endedAt,
      durationSeconds: conversations.durationSeconds,
      status: conversations.status,
      summary: conversations.summary,
      sentiment: conversations.sentiment,
      concerns: conversations.concerns,
      transcript: conversations.transcript,
    })
    .from(conversations)
    .leftJoin(seniors, eq(conversations.seniorId, seniors.id))
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    res.json({
      id: call.id,
      call_sid: call.callSid,
      senior_id: call.seniorId,
      senior_name: call.seniorName,
      senior_phone: call.seniorPhone,
      started_at: call.startedAt,
      ended_at: call.endedAt,
      duration_seconds: call.durationSeconds,
      status: call.status || 'completed',
      summary: call.summary,
      sentiment: call.sentiment,
      concerns: call.concerns,
      transcript: call.transcript,
    });
  } catch (error) {
    console.error('Error fetching call:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get call timeline (events from transcript)
app.get('/api/observability/calls/:id/timeline', async (req, res) => {
  try {
    const [call] = await db.select({
      id: conversations.id,
      callSid: conversations.callSid,
      startedAt: conversations.startedAt,
      endedAt: conversations.endedAt,
      durationSeconds: conversations.durationSeconds,
      transcript: conversations.transcript,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Build timeline from transcript
    const events = [];

    // Add call start event
    events.push({
      type: 'call.initiated',
      timestamp: call.startedAt,
      data: { callSid: call.callSid },
    });

    // Add transcript events if available
    if (call.transcript && Array.isArray(call.transcript)) {
      call.transcript.forEach((turn, index) => {
        if (turn.role === 'user') {
          events.push({
            type: 'turn.transcribed',
            timestamp: turn.timestamp || call.startedAt,
            data: { content: turn.content, turnIndex: index },
          });
        } else if (turn.role === 'assistant') {
          events.push({
            type: 'turn.response',
            timestamp: turn.timestamp || call.startedAt,
            data: { content: turn.content, turnIndex: index },
          });
        }
        // Add observer signals if present
        if (turn.observer) {
          events.push({
            type: 'observer.signal',
            timestamp: turn.timestamp || call.startedAt,
            data: turn.observer,
          });
        }
      });
    }

    // Add call end event
    if (call.endedAt) {
      events.push({
        type: 'call.ended',
        timestamp: call.endedAt,
        data: { durationSeconds: call.durationSeconds },
      });
    }

    res.json({
      callId: call.id,
      events,
    });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get call turns (conversation turns)
app.get('/api/observability/calls/:id/turns', async (req, res) => {
  try {
    const [call] = await db.select({
      transcript: conversations.transcript,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const turns = (call.transcript || []).map((turn, index) => ({
      id: index,
      role: turn.role,
      content: turn.content,
      timestamp: turn.timestamp,
    }));

    res.json({ turns });
  } catch (error) {
    console.error('Error fetching turns:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get observer signals for a call
app.get('/api/observability/calls/:id/observer', async (req, res) => {
  try {
    const [call] = await db.select({
      transcript: conversations.transcript,
      concerns: conversations.concerns,
      sentiment: conversations.sentiment,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Extract observer signals from transcript
    const signals = [];
    if (call.transcript && Array.isArray(call.transcript)) {
      call.transcript.forEach((turn) => {
        if (turn.observer) {
          signals.push({
            timestamp: turn.timestamp,
            engagementLevel: turn.observer.engagement_level || turn.observer.engagementLevel,
            emotionalState: turn.observer.emotional_state || turn.observer.emotionalState,
            concerns: turn.observer.concerns || [],
            suggestedTopic: turn.observer.suggested_topic || turn.observer.suggestedTopic,
            shouldDeliverReminder: turn.observer.should_deliver_reminder || turn.observer.shouldDeliverReminder,
            shouldEndCall: turn.observer.should_end_call || turn.observer.shouldEndCall,
          });
        }
      });
    }

    // Calculate aggregates
    const aggregates = {
      avgEngagement: 'medium',
      dominantEmotion: call.sentiment || 'neutral',
      totalConcerns: (call.concerns || []).length,
      concerns: call.concerns || [],
    };

    res.json({ signals, aggregates });
  } catch (error) {
    console.error('Error fetching observer data:', error);
    res.status(500).json({ error: error.message });
  }
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

  // Send a ping to keep connection alive
  const pingInterval = setInterval(() => {
    if (twilioWs.readyState === 1) {
      twilioWs.ping();
    }
  }, 30000);

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

          // Get reminder context which now includes the delivery record
          const reminderContext = schedulerService.getReminderContext(callSid);
          const currentDelivery = reminderContext?.delivery || null;

          // V3.0: Always use V1 (Claude + 4-layer observer)
          console.log(`[${callSid}] Creating V1 session (Claude + 4-layer observer)${currentDelivery ? ' with reminder tracking' : ''}`);
          geminiSession = new V1AdvancedSession(
            twilioWs,
            streamSid,
            metadata.senior,
            metadata.memoryContext,
            metadata.reminderPrompt,
            [], // pendingReminders
            currentDelivery // delivery record for acknowledgment tracking
          );
          sessions.set(callSid, geminiSession);

          try {
            await geminiSession.connect();
          } catch (error) {
            console.error(`[${callSid}] Failed to start V1 session:`, error);
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
    console.error(`[${callSid}] WebSocket error:`, error);
  });
});

// === BROWSER CALL WebSocket (V0 - disabled in v3.0) ===
// Browser calls used V0 Gemini sessions - commented out for now
// const browserWss = new WebSocketServer({ noServer: true });
//
// browserWss.on('connection', async (browserWs, req) => {
//   console.log('[Browser] New browser call connection');
//   const { query } = parseUrl(req.url, true);
//   const seniorId = query.seniorId;
//   let senior = null;
//   let memoryContext = null;
//   let browserSession = null;
//   if (seniorId) {
//     try {
//       senior = await seniorService.getById(seniorId);
//       if (senior) {
//         console.log(`[Browser] Found senior: ${senior.name}`);
//         memoryContext = await memoryService.buildContext(senior.id, null, senior);
//       }
//     } catch (error) {
//       console.error('[Browser] Error fetching senior:', error);
//     }
//   }
//   browserSession = new BrowserSession(browserWs, senior, memoryContext);
//   try {
//     await browserSession.connect();
//   } catch (error) {
//     console.error('[Browser] Failed to start session:', error);
//     browserWs.close();
//     return;
//   }
//   browserWs.on('message', (message) => {
//     if (Buffer.isBuffer(message) || message instanceof ArrayBuffer) {
//       browserSession.sendAudio(message);
//     }
//   });
//   browserWs.on('close', async () => {
//     console.log('[Browser] Connection closed');
//     if (browserSession) {
//       await browserSession.close();
//     }
//   });
//   browserWs.on('error', (error) => {
//     console.error('[Browser] WebSocket error:', error);
//   });
// });

// Handle WebSocket upgrade for Twilio media stream
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/media-stream') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  // Browser call disabled in v3.0 (was V0 Gemini)
  // } else if (pathname === '/browser-call') {
  //   browserWss.handleUpgrade(request, socket, head, (ws) => {
  //     browserWss.emit('connection', ws, request);
  //   });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Donna v3.0 listening on port ${PORT}`);
  console.log(`Voice webhook: ${BASE_URL}/voice/answer`);
  console.log(`Media stream: ${WS_URL}/media-stream`);
  console.log(`Pipeline: Claude + 4-layer observer + ElevenLabs streaming`);
  console.log(`Features: Dynamic model routing, Post-turn agent, Streaming TTS`);

  // Start the reminder scheduler (check every minute)
  startScheduler(BASE_URL, 60000);
});
