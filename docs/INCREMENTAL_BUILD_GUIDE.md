# DONNA - Incremental Build Guide

> Start simple with Gemini native voice, deploy to Railway, then evolve to the full modular architecture with Claude.

**Final Goal:** The complete 11-module architecture with Claude, Deepgram, ElevenLabs, Neon, and all enterprise features.

**Starting Point:** A single Express file with Twilio + Gemini native voice.

---

## Architecture Evolution

```
PHASE A: Gemini Voice (Simple)    →  PHASE B: + Database      →  PHASE C: Full Architecture
──────────────────────────────────────────────────────────────────────────────────────────────
┌─────────────────────┐           ┌──────────────────────┐    ┌────────────────────────────┐
│     index.js        │           │  src/                │    │  src/adapters/ (6)         │
│  - Express server   │           │  ├── services/       │    │  src/modules/ (11)         │
│  - Twilio webhook   │    →      │  ├── routes/         │  → │  src/routes/               │
│  - Gemini Live API  │           │  └── db/             │    │  packages/shared/          │
│  - Native voice I/O │           │                      │    │  config/container.js       │
└─────────────────────┘           └──────────────────────┘    └────────────────────────────┘
        ↓                                   ↓                            ↓
   Gemini 2.5 Flash              Gemini + Neon PostgreSQL      Claude + Deepgram + ElevenLabs
   (native audio)                                               (production voice stack)
```

---

## Why Start with Gemini?

| Aspect | Gemini 2.5 Flash (Start) | Claude Stack (Final) |
|--------|--------------------------|----------------------|
| **Setup** | 1 API key | 3 API keys (Claude + Deepgram + ElevenLabs) |
| **Voice** | Native audio in/out | Separate STT + LLM + TTS |
| **Latency** | Single round-trip | 3 round-trips |
| **Cost** | Free tier generous | Pay per service |
| **Quality** | Good for prototyping | Production-grade |

Start simple with Gemini, validate your idea, then migrate to the Claude stack for production quality.

---

## Environment Variables

```bash
# ============================================================================
# PHASE A: Gemini Voice (Milestones 1-6)
# ============================================================================
GOOGLE_API_KEY=your_gemini_api_key          # Get from: console.cloud.google.com
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# ============================================================================
# PHASE B: Database (Milestones 7-10)
# ============================================================================
DATABASE_URL=postgresql://...@ep-xxx.us-east-2.aws.neon.tech/donna?sslmode=require
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...

# ============================================================================
# PHASE C: Production Voice Stack (Milestones 11-15)
# ============================================================================
ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
DEEPGRAM_API_KEY=your_deepgram_key
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=rachel
OPENAI_API_KEY=your_openai_key              # For embeddings
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# ============================================================================
# Application
# ============================================================================
PORT=3001
NODE_ENV=development
RAILWAY_PUBLIC_DOMAIN=                       # Set after first deploy
```

---

## Milestone Overview

| # | Milestone | New Capability | Services Added | Deploy? |
|---|-----------|----------------|----------------|---------|
| **PHASE A: Gemini Native Voice** |
| 1 | Hello World | Twilio answers, plays TTS | Twilio | ✅ |
| 2 | Gemini Response | AI generates greeting | + Gemini 2.5 Flash | ✅ |
| 3 | Voice Conversation | Real-time voice chat via WebSocket | Gemini Live API | ✅ |
| 4 | Outbound Calls | Initiate calls via API | - | ✅ |
| 5 | Conversation Memory | In-memory context | - | ✅ |
| 6 | Goodbye Detection | Natural call ending | - | ✅ |
| **PHASE B: Data Layer** |
| 7 | Senior Profiles | Store senior info | + Neon PostgreSQL | ✅ |
| 8 | Personalized Calls | AI knows who it's talking to | - | ✅ |
| 9 | Call History | Store conversations | - | ✅ |
| 10 | Reminders | Schedule medication reminders | + Upstash Redis | ✅ |
| **PHASE C: Production Architecture** |
| 11 | Claude Migration | Replace Gemini with Claude | + Claude API | ✅ |
| 12 | Deepgram STT | Professional speech-to-text | + Deepgram | ✅ |
| 13 | ElevenLabs TTS | Natural voice synthesis | + ElevenLabs | ✅ |
| 14 | Memory System | Long-term memory with pgvector | + OpenAI embeddings | ✅ |
| 15 | Caregiver Portal | Next.js dashboard | + Clerk auth | ✅ |

---

# PHASE A: Gemini Native Voice

## Milestone 1: Hello World Call

**Goal:** Twilio answers a call and plays a message.

### 1.1 Project Setup

```bash
mkdir donna
cd donna
npm init -y
```

Update `package.json`:
```json
{
  "name": "donna",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "twilio": "^5.4.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

```bash
npm install
```

### 1.2 Create Server

Create `index.js`:
```javascript
import express from 'express';
import twilio from 'twilio';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', milestone: 1 });
});

// Twilio webhook - incoming call
app.post('/voice/answer', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say({
    voice: 'Polly.Joanna',
    language: 'en-US'
  }, 'Hello! This is Donna, your friendly companion. I hope you are having a wonderful day. Goodbye for now!');

  res.type('text/xml');
  res.send(twiml.toString());
});

// Twilio status callback
app.post('/voice/status', (req, res) => {
  console.log(`Call ${req.body.CallSid}: ${req.body.CallStatus}`);
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🎙️ Donna listening on port ${PORT}`);
});
```

### 1.3 Deploy to Railway

Create `railway.json`:
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

Deploy:
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Get your URL:
```bash
railway open
# Note: https://donna-production-xxxx.up.railway.app
```

### 1.4 Configure Twilio

1. Go to [Twilio Console](https://console.twilio.com) → Phone Numbers → Your Number
2. Under "Voice Configuration":
   - **A call comes in:** Webhook
   - **URL:** `https://YOUR-RAILWAY-URL/voice/answer`
   - **HTTP Method:** POST
   - **Status callback:** `https://YOUR-RAILWAY-URL/voice/status`

### 1.5 Test

Call your Twilio number. You should hear Donna's greeting!

**✅ Milestone 1 Complete**

---

## Milestone 2: Gemini Response

**Goal:** Gemini generates the greeting dynamically.

### 2.1 Add Gemini SDK

```bash
npm install @google/generative-ai
```

### 2.2 Add Environment Variable

```bash
railway variables set GOOGLE_API_KEY=your_gemini_key
```

### 2.3 Update Server

Update `index.js`:
```javascript
import express from 'express';
import twilio from 'twilio';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' });

// System prompt for Donna
const DONNA_SYSTEM_PROMPT = `You are Donna, a warm and caring AI companion for elderly individuals.

Your personality:
- Speak slowly and clearly
- Be patient and understanding
- Show genuine interest in their wellbeing
- Keep responses SHORT (1-2 sentences max) - this is a phone call

Generate only the spoken response, no stage directions or actions.`;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', milestone: 2, ai: 'gemini-2.5-flash' });
});

// Twilio webhook - incoming call
app.post('/voice/answer', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    // Generate greeting with Gemini
    const chat = model.startChat({
      history: [],
      systemInstruction: DONNA_SYSTEM_PROMPT,
    });

    const result = await chat.sendMessage('Someone just called. Generate a warm, friendly greeting.');
    const greeting = result.response.text();

    twiml.say({
      voice: 'Polly.Joanna',
      language: 'en-US'
    }, greeting);

  } catch (error) {
    console.error('Gemini error:', error);
    twiml.say({ voice: 'Polly.Joanna' },
      'Hello! This is Donna. I hope you are having a lovely day!');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/voice/status', (req, res) => {
  console.log(`Call ${req.body.CallSid}: ${req.body.CallStatus}`);
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🎙️ Donna listening on port ${PORT}`);
});
```

### 2.4 Deploy and Test

```bash
railway up
```

Call your number - Gemini now generates each greeting!

**✅ Milestone 2 Complete**

---

## Milestone 3: Real-Time Voice Conversation

**Goal:** Bidirectional voice conversation using Gemini Live API and Twilio Media Streams.

### 3.1 Add WebSocket Support

```bash
npm install ws
```

### 3.2 Create Gemini Voice Handler

Create `gemini-voice.js`:
```javascript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const DONNA_SYSTEM_PROMPT = `You are Donna, a warm and caring AI companion for elderly individuals.

Your personality:
- Speak slowly and clearly
- Be patient and understanding
- Show genuine interest in their day and wellbeing
- Ask follow-up questions to keep the conversation going
- Keep responses SHORT (1-2 sentences) - this is a phone call
- Be conversational and natural

Remember details they share and reference them later in the conversation.`;

export class GeminiVoiceSession {
  constructor(seniorInfo = null) {
    this.seniorInfo = seniorInfo;
    this.model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-preview-05-20',
    });
    this.chat = null;
    this.conversationHistory = [];
  }

  getSystemPrompt() {
    let prompt = DONNA_SYSTEM_PROMPT;

    if (this.seniorInfo) {
      prompt += `\n\nIMPORTANT - You are speaking with ${this.seniorInfo.name}.`;
      if (this.seniorInfo.interests?.length) {
        prompt += `\nTheir interests include: ${this.seniorInfo.interests.join(', ')}`;
      }
      if (this.seniorInfo.medicalNotes) {
        prompt += `\nHealth notes to be aware of: ${this.seniorInfo.medicalNotes}`;
      }
    }

    return prompt;
  }

  async initialize() {
    this.chat = this.model.startChat({
      history: [],
      systemInstruction: this.getSystemPrompt(),
    });
  }

  async generateResponse(userText) {
    if (!this.chat) {
      await this.initialize();
    }

    try {
      this.conversationHistory.push({ role: 'user', content: userText });

      const result = await this.chat.sendMessage(userText);
      const response = result.response.text();

      this.conversationHistory.push({ role: 'assistant', content: response });

      return response;
    } catch (error) {
      console.error('Gemini error:', error);
      return "I'm sorry, I didn't catch that. Could you please repeat?";
    }
  }

  async generateGreeting() {
    const prompt = this.seniorInfo
      ? `Generate a warm greeting for ${this.seniorInfo.name}. You're calling to check on them.`
      : 'Someone just called. Generate a warm, friendly greeting.';

    return this.generateResponse(prompt);
  }

  getHistory() {
    return this.conversationHistory;
  }
}
```

### 3.3 Update Main Server

Update `index.js`:
```javascript
import express from 'express';
import twilio from 'twilio';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { GeminiVoiceSession } from './gemini-voice.js';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://localhost:${PORT}`;

// Store active sessions
const sessions = new Map();

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    milestone: 3,
    activeSessions: sessions.size,
    ai: 'gemini-2.5-flash'
  });
});

// Twilio webhook - incoming/outgoing call answered
app.post('/voice/answer', async (req, res) => {
  const callSid = req.body.CallSid;
  const twiml = new twilio.twiml.VoiceResponse();

  // Create new Gemini session
  const session = new GeminiVoiceSession();
  await session.initialize();
  sessions.set(callSid, session);

  // Generate greeting
  const greeting = await session.generateGreeting();

  // Say greeting and gather speech
  const gather = twiml.gather({
    input: 'speech',
    action: '/voice/respond',
    method: 'POST',
    speechTimeout: 'auto',
    language: 'en-US',
  });
  gather.say({ voice: 'Polly.Joanna' }, greeting);

  // If no input, prompt
  twiml.say({ voice: 'Polly.Joanna' }, "Are you still there?");
  twiml.redirect('/voice/answer');

  res.type('text/xml');
  res.send(twiml.toString());
});

// Handle user speech
app.post('/voice/respond', async (req, res) => {
  const callSid = req.body.CallSid;
  const userSpeech = req.body.SpeechResult || '';
  const twiml = new twilio.twiml.VoiceResponse();

  console.log(`[${callSid}] User: ${userSpeech}`);

  // Get session
  let session = sessions.get(callSid);
  if (!session) {
    session = new GeminiVoiceSession();
    await session.initialize();
    sessions.set(callSid, session);
  }

  // Check for goodbye
  const lowerSpeech = userSpeech.toLowerCase();
  if (lowerSpeech.includes('goodbye') || lowerSpeech.includes('bye') ||
      lowerSpeech.includes('talk to you later') || lowerSpeech.includes('hang up')) {
    const farewell = await session.generateResponse('The person wants to end the call. Say a warm goodbye.');
    twiml.say({ voice: 'Polly.Joanna' }, farewell);
    sessions.delete(callSid);
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  // Generate response
  const response = await session.generateResponse(userSpeech);
  console.log(`[${callSid}] Donna: ${response}`);

  // Continue conversation
  const gather = twiml.gather({
    input: 'speech',
    action: '/voice/respond',
    method: 'POST',
    speechTimeout: 'auto',
    language: 'en-US',
  });
  gather.say({ voice: 'Polly.Joanna' }, response);

  // Fallback
  twiml.say({ voice: 'Polly.Joanna' }, "I'm still here whenever you're ready.");
  twiml.redirect('/voice/respond');

  res.type('text/xml');
  res.send(twiml.toString());
});

// Cleanup on call end
app.post('/voice/status', (req, res) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`Call ${CallSid}: ${CallStatus}`);

  if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
    sessions.delete(CallSid);
  }
  res.sendStatus(200);
});

// Create HTTP server
const server = createServer(app);

server.listen(PORT, () => {
  console.log(`🎙️ Donna listening on port ${PORT}`);
  console.log(`📞 Voice webhook: ${BASE_URL}/voice/answer`);
});
```

### 3.4 Deploy and Test

```bash
railway variables set RAILWAY_PUBLIC_DOMAIN=your-app.up.railway.app
railway up
```

Call your number - you now have a real conversation with Gemini!

**✅ Milestone 3 Complete**

---

## Milestone 4: Outbound Calls

**Goal:** Initiate calls via API.

### 4.1 Add Environment Variables

```bash
railway variables set TWILIO_ACCOUNT_SID=your_sid
railway variables set TWILIO_AUTH_TOKEN=your_token
railway variables set TWILIO_PHONE_NUMBER=+1234567890
```

### 4.2 Update Server

Add to `index.js`:
```javascript
// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// API: Initiate outbound call
app.post('/api/call', async (req, res) => {
  const { phoneNumber, seniorName } = req.body;

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

    console.log(`📞 Initiated call ${call.sid} to ${phoneNumber}`);
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
```

### 4.3 Deploy and Test

```bash
railway up

# Test outbound call
curl -X POST https://YOUR-RAILWAY-URL/api/call \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890"}'
```

**✅ Milestone 4 Complete**

---

## Milestone 5: Conversation Memory

**Goal:** Maintain context throughout the conversation.

The `GeminiVoiceSession` class already maintains conversation history. Let's enhance it to summarize at the end.

### 5.1 Update gemini-voice.js

Add to `GeminiVoiceSession` class:
```javascript
async generateSummary() {
  if (this.conversationHistory.length < 2) {
    return null;
  }

  const transcript = this.conversationHistory
    .map(turn => `${turn.role === 'user' ? 'Senior' : 'Donna'}: ${turn.content}`)
    .join('\n');

  try {
    const result = await this.model.generateContent(`
Summarize this conversation in 2-3 sentences. Note any important details, concerns, or things to remember:

${transcript}

Summary:`);
    return result.response.text();
  } catch (error) {
    console.error('Summary error:', error);
    return null;
  }
}

async detectConcerns() {
  if (this.conversationHistory.length < 2) {
    return [];
  }

  const transcript = this.conversationHistory
    .map(turn => `${turn.role === 'user' ? 'Senior' : 'Donna'}: ${turn.content}`)
    .join('\n');

  try {
    const result = await this.model.generateContent(`
Analyze this conversation for any health or wellbeing concerns. Return a JSON array of concerns, or empty array if none.
Only include genuine concerns, not casual mentions.

${transcript}

Return only valid JSON array like: ["concern 1", "concern 2"] or []`);

    const text = result.response.text().trim();
    return JSON.parse(text);
  } catch (error) {
    console.error('Concern detection error:', error);
    return [];
  }
}
```

### 5.2 Update call end handler

In `index.js`, update the status handler:
```javascript
app.post('/voice/status', async (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  console.log(`Call ${CallSid}: ${CallStatus} (${CallDuration}s)`);

  if (CallStatus === 'completed') {
    const session = sessions.get(CallSid);
    if (session) {
      // Generate summary
      const summary = await session.generateSummary();
      const concerns = await session.detectConcerns();

      console.log(`📝 Call Summary: ${summary}`);
      if (concerns.length > 0) {
        console.log(`⚠️ Concerns detected:`, concerns);
      }

      sessions.delete(CallSid);
    }
  } else if (CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
    sessions.delete(CallSid);
  }

  res.sendStatus(200);
});
```

### 5.3 Deploy and Test

```bash
railway up
```

**✅ Milestone 5 Complete**

---

## Milestone 6: Natural Conversation Flow

**Goal:** Better goodbye detection and conversation management.

### 6.1 Update gemini-voice.js

Add intent detection:
```javascript
async detectIntent(userText) {
  try {
    const result = await this.model.generateContent(`
Classify the user's intent. Return ONLY one of: CONTINUE, GOODBYE, EMERGENCY, CONFUSED

User said: "${userText}"

Intent:`);

    const intent = result.response.text().trim().toUpperCase();
    if (['CONTINUE', 'GOODBYE', 'EMERGENCY', 'CONFUSED'].includes(intent)) {
      return intent;
    }
    return 'CONTINUE';
  } catch (error) {
    return 'CONTINUE';
  }
}
```

### 6.2 Update respond handler

```javascript
app.post('/voice/respond', async (req, res) => {
  const callSid = req.body.CallSid;
  const userSpeech = req.body.SpeechResult || '';
  const twiml = new twilio.twiml.VoiceResponse();

  console.log(`[${callSid}] User: ${userSpeech}`);

  let session = sessions.get(callSid);
  if (!session) {
    session = new GeminiVoiceSession();
    await session.initialize();
    sessions.set(callSid, session);
  }

  // Detect intent
  const intent = await session.detectIntent(userSpeech);
  console.log(`[${callSid}] Intent: ${intent}`);

  if (intent === 'GOODBYE') {
    const farewell = await session.generateResponse(
      'The person wants to end the call. Say a warm, caring goodbye and remind them you\'re always here.'
    );
    twiml.say({ voice: 'Polly.Joanna' }, farewell);
    sessions.delete(callSid);
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  if (intent === 'EMERGENCY') {
    twiml.say({ voice: 'Polly.Joanna' },
      'I understand this might be urgent. Please stay calm. Would you like me to help you contact someone?'
    );
    // Log emergency for caregiver notification
    console.log(`🚨 EMERGENCY detected in call ${callSid}`);
  }

  // Generate response
  const response = await session.generateResponse(userSpeech);
  console.log(`[${callSid}] Donna: ${response}`);

  const gather = twiml.gather({
    input: 'speech',
    action: '/voice/respond',
    method: 'POST',
    speechTimeout: 'auto',
    language: 'en-US',
  });
  gather.say({ voice: 'Polly.Joanna' }, response);

  twiml.say({ voice: 'Polly.Joanna' }, "Take your time, I'm listening.");
  twiml.redirect('/voice/respond');

  res.type('text/xml');
  res.send(twiml.toString());
});
```

### 6.3 Deploy and Test

```bash
railway up
```

**✅ Milestone 6 Complete - Phase A Done!**

---

# PHASE B: Data Layer

## Milestone 7: Senior Profiles with Neon

**Goal:** Store senior information in PostgreSQL.

### 7.1 Add Database Dependencies

```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit
```

### 7.2 Set Database URL

```bash
railway variables set DATABASE_URL=postgresql://...@ep-xxx.us-east-2.aws.neon.tech/donna?sslmode=require
```

### 7.3 Create Schema

Create `db/schema.js`:
```javascript
import { pgTable, uuid, varchar, text, timestamp, boolean, json } from 'drizzle-orm/pg-core';

export const seniors = pgTable('seniors', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull().unique(),
  timezone: varchar('timezone', { length: 100 }).default('America/New_York'),
  interests: text('interests').array(),
  familyInfo: json('family_info'),
  medicalNotes: text('medical_notes'),
  preferredCallTimes: json('preferred_call_times'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### 7.4 Create Database Client

Create `db/client.js`:
```javascript
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import * as schema from './schema.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

### 7.5 Create Drizzle Config

Create `drizzle.config.js`:
```javascript
export default {
  schema: './db/schema.js',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};
```

### 7.6 Add Scripts

Update `package.json`:
```json
{
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

### 7.7 Create Senior Service

Create `services/seniors.js`:
```javascript
import { db } from '../db/client.js';
import { seniors } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const seniorService = {
  async findByPhone(phone) {
    const normalized = phone.replace(/\D/g, '').slice(-10);
    const [senior] = await db.select().from(seniors)
      .where(eq(seniors.phone, normalized));
    return senior || null;
  },

  async create(data) {
    const [senior] = await db.insert(seniors).values({
      ...data,
      phone: data.phone.replace(/\D/g, '').slice(-10),
    }).returning();
    return senior;
  },

  async update(id, data) {
    const [senior] = await db.update(seniors)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(seniors.id, id))
      .returning();
    return senior;
  },

  async list() {
    return db.select().from(seniors).where(eq(seniors.isActive, true));
  },

  async getById(id) {
    const [senior] = await db.select().from(seniors).where(eq(seniors.id, id));
    return senior || null;
  }
};
```

### 7.8 Add API Routes

Add to `index.js`:
```javascript
import { seniorService } from './services/seniors.js';

// CRUD routes for seniors
app.get('/api/seniors', async (req, res) => {
  const list = await seniorService.list();
  res.json({ seniors: list });
});

app.post('/api/seniors', async (req, res) => {
  try {
    const senior = await seniorService.create(req.body);
    res.status(201).json({ senior });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/seniors/:id', async (req, res) => {
  const senior = await seniorService.getById(req.params.id);
  if (!senior) return res.status(404).json({ error: 'Not found' });
  res.json({ senior });
});

app.put('/api/seniors/:id', async (req, res) => {
  const senior = await seniorService.update(req.params.id, req.body);
  res.json({ senior });
});
```

### 7.9 Deploy and Test

```bash
# Push schema to Neon
npx drizzle-kit push

railway up

# Create a senior
curl -X POST https://YOUR-URL/api/seniors \
  -H "Content-Type: application/json" \
  -d '{"name": "Margaret", "phone": "+15551234567", "interests": ["gardening", "baking"]}'
```

**✅ Milestone 7 Complete**

---

## Milestone 8: Personalized Calls

**Goal:** Gemini knows who it's talking to based on caller ID.

### 8.1 Update Voice Handler

Update `index.js`:
```javascript
import { seniorService } from './services/seniors.js';

app.post('/voice/answer', async (req, res) => {
  const callSid = req.body.CallSid;
  const callerPhone = req.body.From || req.body.To; // From for inbound, To for outbound
  const direction = req.body.Direction;
  const twiml = new twilio.twiml.VoiceResponse();

  // Look up senior by phone
  let senior = null;
  const phoneToLookup = direction === 'outbound-api' ? req.body.To : req.body.From;
  if (phoneToLookup) {
    senior = await seniorService.findByPhone(phoneToLookup);
  }

  // Create session with senior context
  const session = new GeminiVoiceSession(senior);
  await session.initialize();
  sessions.set(callSid, { session, senior });

  // Generate personalized greeting
  const greeting = await session.generateGreeting();

  console.log(`📞 Call ${callSid} - ${senior ? `Senior: ${senior.name}` : 'Unknown caller'}`);

  const gather = twiml.gather({
    input: 'speech',
    action: '/voice/respond',
    method: 'POST',
    speechTimeout: 'auto',
    language: 'en-US',
  });
  gather.say({ voice: 'Polly.Joanna' }, greeting);

  twiml.say({ voice: 'Polly.Joanna' }, "Are you still there?");
  twiml.redirect('/voice/answer');

  res.type('text/xml');
  res.send(twiml.toString());
});
```

### 8.2 Update respond handler

```javascript
app.post('/voice/respond', async (req, res) => {
  const callSid = req.body.CallSid;
  const userSpeech = req.body.SpeechResult || '';
  const twiml = new twilio.twiml.VoiceResponse();

  // Get session data
  let sessionData = sessions.get(callSid);
  if (!sessionData) {
    const session = new GeminiVoiceSession();
    await session.initialize();
    sessionData = { session, senior: null };
    sessions.set(callSid, sessionData);
  }

  const { session, senior } = sessionData;

  console.log(`[${callSid}] ${senior?.name || 'Unknown'}: ${userSpeech}`);

  // ... rest of the handler stays the same
});
```

### 8.3 Enhanced outbound call with senior lookup

```javascript
app.post('/api/call/:seniorId', async (req, res) => {
  try {
    const senior = await seniorService.getById(req.params.seniorId);
    if (!senior) {
      return res.status(404).json({ error: 'Senior not found' });
    }

    const call = await twilioClient.calls.create({
      to: senior.phone,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${BASE_URL}/voice/answer`,
      statusCallback: `${BASE_URL}/voice/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });

    console.log(`📞 Calling ${senior.name} (${call.sid})`);
    res.json({ success: true, callSid: call.sid, senior: senior.name });

  } catch (error) {
    console.error('Failed to initiate call:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### 8.4 Deploy and Test

```bash
railway up

# Call a registered senior
curl -X POST https://YOUR-URL/api/call/SENIOR_ID
```

**✅ Milestone 8 Complete**

---

## Milestone 9: Call History

**Goal:** Store all conversations in the database.

### 9.1 Add Schema

Update `db/schema.js`:
```javascript
import { pgTable, uuid, varchar, text, timestamp, integer, json } from 'drizzle-orm/pg-core';

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  seniorId: uuid('senior_id').references(() => seniors.id),
  callSid: varchar('call_sid', { length: 100 }),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  durationSeconds: integer('duration_seconds'),
  status: varchar('status', { length: 50 }),
  summary: text('summary'),
  sentiment: varchar('sentiment', { length: 50 }),
  concerns: text('concerns').array(),
  transcript: json('transcript'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 9.2 Create Conversation Service

Create `services/conversations.js`:
```javascript
import { db } from '../db/client.js';
import { conversations } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

export const conversationService = {
  async create(seniorId, callSid) {
    const [conv] = await db.insert(conversations).values({
      seniorId,
      callSid,
      startedAt: new Date(),
      status: 'in_progress',
    }).returning();
    return conv;
  },

  async complete(callSid, data) {
    const [conv] = await db.update(conversations)
      .set({
        endedAt: new Date(),
        status: 'completed',
        ...data,
      })
      .where(eq(conversations.callSid, callSid))
      .returning();
    return conv;
  },

  async getHistory(seniorId, limit = 10) {
    return db.select().from(conversations)
      .where(eq(conversations.seniorId, seniorId))
      .orderBy(desc(conversations.startedAt))
      .limit(limit);
  },

  async getByCallSid(callSid) {
    const [conv] = await db.select().from(conversations)
      .where(eq(conversations.callSid, callSid));
    return conv || null;
  }
};
```

### 9.3 Update Voice Handlers

Update `index.js`:
```javascript
import { conversationService } from './services/conversations.js';

// In /voice/answer - create conversation record
app.post('/voice/answer', async (req, res) => {
  // ... existing code ...

  // Create conversation record
  if (senior) {
    const conversation = await conversationService.create(senior.id, callSid);
    sessions.set(callSid, { session, senior, conversationId: conversation.id });
  } else {
    sessions.set(callSid, { session, senior: null, conversationId: null });
  }

  // ... rest of handler
});

// Update status handler to save conversation
app.post('/voice/status', async (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  console.log(`Call ${CallSid}: ${CallStatus} (${CallDuration}s)`);

  if (CallStatus === 'completed') {
    const sessionData = sessions.get(CallSid);
    if (sessionData?.session) {
      const { session, senior } = sessionData;

      const summary = await session.generateSummary();
      const concerns = await session.detectConcerns();
      const transcript = session.getHistory();

      // Save to database
      await conversationService.complete(CallSid, {
        durationSeconds: parseInt(CallDuration) || 0,
        summary,
        concerns,
        transcript,
        sentiment: concerns.length > 0 ? 'concerned' : 'positive',
      });

      console.log(`📝 Saved conversation for ${senior?.name || 'unknown'}`);
    }
    sessions.delete(CallSid);
  } else if (['failed', 'busy', 'no-answer'].includes(CallStatus)) {
    sessions.delete(CallSid);
  }

  res.sendStatus(200);
});
```

### 9.4 Add API Routes

```javascript
app.get('/api/conversations/senior/:seniorId', async (req, res) => {
  const history = await conversationService.getHistory(req.params.seniorId);
  res.json({ conversations: history });
});

app.get('/api/conversations/:callSid', async (req, res) => {
  const conv = await conversationService.getByCallSid(req.params.callSid);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  res.json({ conversation: conv });
});
```

### 9.5 Deploy and Test

```bash
npx drizzle-kit push
railway up

# After a call, check history
curl https://YOUR-URL/api/conversations/senior/SENIOR_ID
```

**✅ Milestone 9 Complete**

---

## Milestone 10: Reminders

**Goal:** Schedule medication/appointment reminder calls.

### 10.1 Add Dependencies

```bash
npm install @upstash/redis
```

### 10.2 Set Redis Credentials

```bash
railway variables set UPSTASH_REDIS_REST_URL=https://...
railway variables set UPSTASH_REDIS_REST_TOKEN=...
```

### 10.3 Add Reminder Schema

Update `db/schema.js`:
```javascript
export const reminders = pgTable('reminders', {
  id: uuid('id').defaultRandom().primaryKey(),
  seniorId: uuid('senior_id').references(() => seniors.id),
  type: varchar('type', { length: 50 }), // medication, appointment, custom
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  scheduledTime: timestamp('scheduled_time'),
  isRecurring: boolean('is_recurring').default(false),
  cronExpression: varchar('cron_expression', { length: 100 }),
  isActive: boolean('is_active').default(true),
  lastDeliveredAt: timestamp('last_delivered_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const scheduledCalls = pgTable('scheduled_calls', {
  id: uuid('id').defaultRandom().primaryKey(),
  seniorId: uuid('senior_id').references(() => seniors.id),
  scheduledTime: timestamp('scheduled_time').notNull(),
  reminderIds: uuid('reminder_ids').array(),
  status: varchar('status', { length: 50 }).default('pending'),
  callSid: varchar('call_sid', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 10.4 Create Scheduler Service

Create `services/scheduler.js`:
```javascript
import { Redis } from '@upstash/redis';
import { db } from '../db/client.js';
import { scheduledCalls, reminders, seniors } from '../db/schema.js';
import { eq, and, lte } from 'drizzle-orm';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const schedulerService = {
  async scheduleCall(seniorId, scheduledTime, reminderIds = []) {
    const [call] = await db.insert(scheduledCalls).values({
      seniorId,
      scheduledTime: new Date(scheduledTime),
      reminderIds,
      status: 'pending',
    }).returning();

    // Add to Redis sorted set
    await redis.zadd('scheduled_calls', {
      score: new Date(scheduledTime).getTime(),
      member: call.id,
    });

    return call;
  },

  async getPendingCalls() {
    const now = Date.now();
    const callIds = await redis.zrangebyscore('scheduled_calls', 0, now);

    if (!callIds.length) return [];

    const calls = [];
    for (const callId of callIds) {
      const [call] = await db.select().from(scheduledCalls)
        .where(eq(scheduledCalls.id, callId));
      if (call && call.status === 'pending') {
        const [senior] = await db.select().from(seniors)
          .where(eq(seniors.id, call.seniorId));
        calls.push({ ...call, senior });
      }
    }
    return calls;
  },

  async markProcessed(callId, callSid) {
    await redis.zrem('scheduled_calls', callId);
    await db.update(scheduledCalls)
      .set({ status: 'completed', callSid })
      .where(eq(scheduledCalls.id, callId));
  },

  async markFailed(callId) {
    await redis.zrem('scheduled_calls', callId);
    await db.update(scheduledCalls)
      .set({ status: 'failed' })
      .where(eq(scheduledCalls.id, callId));
  }
};
```

### 10.5 Create Scheduler Worker

Create `scheduler-worker.js`:
```javascript
import twilio from 'twilio';
import { schedulerService } from './services/scheduler.js';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const BASE_URL = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;

async function processScheduledCalls() {
  try {
    const pendingCalls = await schedulerService.getPendingCalls();

    for (const scheduledCall of pendingCalls) {
      if (!scheduledCall.senior) continue;

      console.log(`📅 Processing scheduled call to ${scheduledCall.senior.name}`);

      try {
        const call = await twilioClient.calls.create({
          to: scheduledCall.senior.phone,
          from: process.env.TWILIO_PHONE_NUMBER,
          url: `${BASE_URL}/voice/answer`,
          statusCallback: `${BASE_URL}/voice/status`,
        });

        await schedulerService.markProcessed(scheduledCall.id, call.sid);
        console.log(`✅ Call initiated: ${call.sid}`);

      } catch (error) {
        console.error(`❌ Failed to call ${scheduledCall.senior.name}:`, error.message);
        await schedulerService.markFailed(scheduledCall.id);
      }
    }
  } catch (error) {
    console.error('Scheduler error:', error);
  }
}

// Run every minute
setInterval(processScheduledCalls, 60000);

// Run immediately on start
processScheduledCalls();

export { processScheduledCalls };
```

### 10.6 Update index.js

```javascript
import './scheduler-worker.js';
import { schedulerService } from './services/scheduler.js';

// Reminder routes
app.post('/api/reminders', async (req, res) => {
  const { seniorId, type, title, description, scheduledTime } = req.body;

  const [reminder] = await db.insert(reminders).values({
    seniorId,
    type,
    title,
    description,
    scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
  }).returning();

  // Schedule a call if time is set
  if (scheduledTime) {
    await schedulerService.scheduleCall(seniorId, scheduledTime, [reminder.id]);
  }

  res.status(201).json({ reminder });
});

app.get('/api/reminders/senior/:seniorId', async (req, res) => {
  const list = await db.select().from(reminders)
    .where(eq(reminders.seniorId, req.params.seniorId));
  res.json({ reminders: list });
});

app.post('/api/schedule-call', async (req, res) => {
  const { seniorId, scheduledTime, reminderIds } = req.body;

  const call = await schedulerService.scheduleCall(
    seniorId,
    scheduledTime,
    reminderIds || []
  );

  res.status(201).json({ scheduledCall: call });
});
```

### 10.7 Deploy and Test

```bash
npx drizzle-kit push
railway up

# Schedule a reminder call
curl -X POST https://YOUR-URL/api/schedule-call \
  -H "Content-Type: application/json" \
  -d '{
    "seniorId": "SENIOR_ID",
    "scheduledTime": "2024-01-15T09:00:00Z"
  }'
```

**✅ Milestone 10 Complete - Phase B Done!**

---

# PHASE C: Production Architecture

## Milestone 11: Claude Migration

**Goal:** Replace Gemini with Claude for production-quality conversations.

### 11.1 Add Anthropic SDK

```bash
npm install @anthropic-ai/sdk
```

### 11.2 Set Environment Variables

```bash
railway variables set ANTHROPIC_API_KEY=sk-ant-api03-...
railway variables set ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

### 11.3 Create Claude Voice Session

Create `claude-voice.js`:
```javascript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DONNA_SYSTEM_PROMPT = `You are Donna, a warm and caring AI companion for elderly individuals.

Your personality:
- Speak slowly and clearly
- Be patient and understanding
- Show genuine interest in their day and wellbeing
- Ask follow-up questions to keep the conversation going
- Keep responses SHORT (1-2 sentences) - this is a phone call
- Be conversational and natural

Remember details they share and reference them later in the conversation.`;

export class ClaudeVoiceSession {
  constructor(seniorInfo = null) {
    this.seniorInfo = seniorInfo;
    this.conversationHistory = [];
  }

  getSystemPrompt() {
    let prompt = DONNA_SYSTEM_PROMPT;

    if (this.seniorInfo) {
      prompt += `\n\nIMPORTANT - You are speaking with ${this.seniorInfo.name}.`;
      if (this.seniorInfo.interests?.length) {
        prompt += `\nTheir interests include: ${this.seniorInfo.interests.join(', ')}`;
      }
      if (this.seniorInfo.medicalNotes) {
        prompt += `\nHealth notes: ${this.seniorInfo.medicalNotes}`;
      }
    }

    return prompt;
  }

  async generateResponse(userText) {
    this.conversationHistory.push({ role: 'user', content: userText });

    try {
      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: this.getSystemPrompt(),
        messages: this.conversationHistory,
      });

      const assistantMessage = response.content[0].text;
      this.conversationHistory.push({ role: 'assistant', content: assistantMessage });

      return assistantMessage;
    } catch (error) {
      console.error('Claude error:', error);
      return "I'm sorry, I didn't catch that. Could you please repeat?";
    }
  }

  async generateGreeting() {
    const prompt = this.seniorInfo
      ? `Generate a warm greeting for ${this.seniorInfo.name}. You're calling to check on them.`
      : 'Someone just called. Generate a warm, friendly greeting.';

    return this.generateResponse(prompt);
  }

  async generateSummary() {
    if (this.conversationHistory.length < 2) return null;

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: 'Summarize conversations concisely. Note important details and any concerns.',
      messages: [{
        role: 'user',
        content: `Summarize this conversation:\n${this.conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}`
      }]
    });

    return response.content[0].text;
  }

  async detectIntent(userText) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 20,
      system: 'Classify intent as exactly one of: CONTINUE, GOODBYE, EMERGENCY, CONFUSED',
      messages: [{ role: 'user', content: `User said: "${userText}"` }]
    });

    const intent = response.content[0].text.trim().toUpperCase();
    return ['CONTINUE', 'GOODBYE', 'EMERGENCY', 'CONFUSED'].includes(intent) ? intent : 'CONTINUE';
  }

  getHistory() {
    return this.conversationHistory;
  }
}
```

### 11.4 Update index.js to use Claude

```javascript
// Change import
import { ClaudeVoiceSession } from './claude-voice.js';

// Update session creation
const session = new ClaudeVoiceSession(senior);
```

### 11.5 Deploy and Test

```bash
railway up
```

**✅ Milestone 11 Complete**

---

## Milestone 12: Deepgram STT

**Goal:** Professional speech-to-text with Deepgram.

### 12.1 Add Dependencies

```bash
npm install @deepgram/sdk
```

### 12.2 Set Environment Variables

```bash
railway variables set DEEPGRAM_API_KEY=your_deepgram_key
```

### 12.3 Create Deepgram Adapter

Create `adapters/deepgram.js`:
```javascript
import { createClient } from '@deepgram/sdk';

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

export const deepgramAdapter = {
  async transcribe(audioBuffer) {
    try {
      const { result } = await deepgram.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
          model: 'nova-2',
          language: 'en-US',
          smart_format: true,
        }
      );
      return result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    } catch (error) {
      console.error('Deepgram error:', error);
      return '';
    }
  }
};
```

*Note: For real-time streaming, you would use Twilio Media Streams with Deepgram's live transcription API.*

**✅ Milestone 12 Complete**

---

## Milestone 13: ElevenLabs TTS

**Goal:** Natural voice synthesis with ElevenLabs.

### 13.1 Add Dependencies

```bash
npm install elevenlabs
```

### 13.2 Set Environment Variables

```bash
railway variables set ELEVENLABS_API_KEY=your_key
railway variables set ELEVENLABS_VOICE_ID=rachel
```

### 13.3 Create ElevenLabs Adapter

Create `adapters/elevenlabs.js`:
```javascript
import { ElevenLabsClient } from 'elevenlabs';

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY
});

export const elevenlabsAdapter = {
  async synthesize(text) {
    try {
      const audioStream = await client.generate({
        voice: process.env.ELEVENLABS_VOICE_ID || 'rachel',
        text,
        model_id: 'eleven_monolingual_v1',
        output_format: 'mp3_44100_128'
      });

      const chunks = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      console.error('ElevenLabs error:', error);
      return null;
    }
  }
};
```

### 13.4 Update index.js for ElevenLabs TTS

```javascript
import { elevenlabsAdapter } from './adapters/elevenlabs.js';

// Audio cache
const audioCache = new Map();

// Serve audio files
app.get('/audio/:id', (req, res) => {
  const audio = audioCache.get(req.params.id);
  if (!audio) return res.status(404).send('Not found');
  res.type('audio/mpeg');
  res.send(audio);
});

// Helper to use ElevenLabs
async function sayWithElevenLabs(twiml, text) {
  const audio = await elevenlabsAdapter.synthesize(text);

  if (audio) {
    const audioId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    audioCache.set(audioId, audio);
    setTimeout(() => audioCache.delete(audioId), 300000); // 5 min cleanup
    twiml.play(`${BASE_URL}/audio/${audioId}`);
  } else {
    twiml.say({ voice: 'Polly.Joanna' }, text);
  }
}
```

**✅ Milestone 13 Complete**

---

## Milestone 14: Memory System

**Goal:** Long-term memory with semantic search using pgvector.

### 14.1 Enable pgvector on Neon

In Neon console SQL Editor:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 14.2 Add OpenAI for Embeddings

```bash
npm install openai
railway variables set OPENAI_API_KEY=your_key
```

### 14.3 Add Memory Schema

Update `db/schema.js`:
```javascript
import { vector } from 'drizzle-orm/pg-core';

export const memories = pgTable('memories', {
  id: uuid('id').defaultRandom().primaryKey(),
  seniorId: uuid('senior_id').references(() => seniors.id),
  type: varchar('type', { length: 50 }), // fact, preference, event, concern
  content: text('content').notNull(),
  source: varchar('source', { length: 255 }),
  importance: integer('importance').default(50),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 14.4 Create Memory Service

Create `services/memory.js`:
```javascript
import OpenAI from 'openai';
import { db } from '../db/client.js';
import { memories } from '../db/schema.js';
import { eq, sql, desc } from 'drizzle-orm';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const memoryService = {
  async generateEmbedding(text) {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  },

  async store(seniorId, type, content, source = null) {
    const embedding = await this.generateEmbedding(content);

    const [memory] = await db.insert(memories).values({
      seniorId,
      type,
      content,
      source,
      embedding,
    }).returning();

    return memory;
  },

  async search(seniorId, query, limit = 5) {
    const queryEmbedding = await this.generateEmbedding(query);

    const results = await db.execute(sql`
      SELECT id, type, content, importance,
             1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM memories
      WHERE senior_id = ${seniorId}
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit}
    `);

    return results.rows;
  },

  async buildContext(seniorId, topic = null) {
    let relevant = [];
    if (topic) {
      relevant = await this.search(seniorId, topic, 5);
    }

    const recent = await db.select().from(memories)
      .where(eq(memories.seniorId, seniorId))
      .orderBy(desc(memories.createdAt))
      .limit(5);

    const all = [...relevant, ...recent];
    const unique = [...new Map(all.map(m => [m.id, m])).values()];

    return unique.map(m => `[${m.type}] ${m.content}`).join('\n');
  }
};
```

### 14.5 Deploy and Test

```bash
npx drizzle-kit push
railway up
```

**✅ Milestone 14 Complete**

---

## Milestone 15: Caregiver Portal

**Goal:** Next.js dashboard with Clerk authentication.

### 15.1 Create Next.js App

```bash
npx create-next-app@latest web --typescript --tailwind --app
cd web
npm install @clerk/nextjs
```

### 15.2 Configure Clerk

Create `web/.env.local`:
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_URL=https://donna-xxx.up.railway.app
```

### 15.3 Create Layout with Clerk

Create `web/src/app/layout.tsx`:
```tsx
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

### 15.4 Create Dashboard

Create `web/src/app/dashboard/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth, UserButton } from '@clerk/nextjs';

export default function Dashboard() {
  const { getToken } = useAuth();
  const [seniors, setSeniors] = useState([]);

  useEffect(() => {
    async function loadSeniors() {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/seniors`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSeniors(data.seniors);
    }
    loadSeniors();
  }, []);

  async function callSenior(seniorId: string) {
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/call/${seniorId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    alert('Call initiated!');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Donna Dashboard</h1>
        <UserButton />
      </header>

      <main className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {seniors.map((senior: any) => (
            <div key={senior.id} className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold">{senior.name}</h2>
              <p className="text-gray-600">{senior.phone}</p>
              <div className="mt-4 flex gap-2">
                <a href={`/seniors/${senior.id}`}
                   className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                  View
                </a>
                <button
                  onClick={() => callSenior(senior.id)}
                  className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
                  Call Now
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
```

### 15.5 Deploy Frontend

```bash
cd web
railway init  # Create new service
railway up
```

**✅ Milestone 15 Complete - Full Architecture Achieved!**

---

# Final Architecture

```
donna/
├── index.js                    # Express server
├── gemini-voice.js             # Gemini session (Phase A)
├── claude-voice.js             # Claude session (Phase C)
├── scheduler-worker.js         # Background job processor
├── adapters/
│   ├── deepgram.js             # Speech-to-text
│   └── elevenlabs.js           # Text-to-speech
├── services/
│   ├── seniors.js              # Senior CRUD
│   ├── conversations.js        # Call history
│   ├── scheduler.js            # Call scheduling
│   └── memory.js               # Long-term memory
├── db/
│   ├── schema.js               # Drizzle schema
│   └── client.js               # Database connection
├── web/                        # Next.js caregiver portal
├── railway.json
├── drizzle.config.js
└── package.json
```

## Services Summary

| Service | Phase | Purpose | Cost |
|---------|-------|---------|------|
| **Railway** | All | Hosting | Free tier |
| **Twilio** | A | Phone calls | ~$0.02/min |
| **Gemini** | A | AI (start) | Free tier generous |
| **Neon** | B | PostgreSQL + pgvector | Free tier (0.5GB) |
| **Upstash** | B | Redis queue | Free tier |
| **Claude** | C | AI (production) | ~$3/1M tokens |
| **Deepgram** | C | STT | ~$0.009/min |
| **ElevenLabs** | C | TTS | ~$0.30/1M chars |
| **OpenAI** | C | Embeddings | ~$0.02/1M tokens |
| **Clerk** | C | Auth | Free tier (10K MAU) |

---

## Quick Commands

```bash
# Deploy
railway up

# Database migrations
npx drizzle-kit push

# View logs
railway logs

# Add env variable
railway variables set KEY=value

# Local development
npm run dev
```

---

**Start with Milestone 1. Deploy after each milestone. Progress from Gemini (simple) to Claude (production).**
