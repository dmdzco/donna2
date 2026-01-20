# Donna Architecture

> Comprehensive technical architecture for the AI Senior Companion system.

---

## System Overview

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                    DONNA SYSTEM                                         │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              CLIENT LAYER                                        │   │
│  │                                                                                  │   │
│  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                      │   │
│  │   │   Senior's   │    │    Admin     │    │   Browser    │                      │   │
│  │   │    Phone     │    │  Dashboard   │    │  Test Call   │                      │   │
│  │   │  (Twilio)    │    │ /admin.html  │    │/browser-call │                      │   │
│  │   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                      │   │
│  │          │                   │                   │                               │   │
│  └──────────┼───────────────────┼───────────────────┼───────────────────────────────┘   │
│             │                   │                   │                                    │
│             │ PSTN/WebRTC       │ HTTP              │ WebSocket                         │
│             │                   │                   │                                    │
│  ┌──────────┼───────────────────┼───────────────────┼───────────────────────────────┐   │
│  │          ▼                   ▼                   ▼                                │   │
│  │                         GATEWAY LAYER                                             │   │
│  │                                                                                   │   │
│  │   ┌─────────────────────────────────────────────────────────────────────────┐    │   │
│  │   │                        Twilio                                            │    │   │
│  │   │  • Phone number: +1-XXX-XXX-XXXX                                        │    │   │
│  │   │  • Webhooks: /voice/answer, /voice/status                               │    │   │
│  │   │  • Media Streams: WebSocket /media-stream                               │    │   │
│  │   │  • Audio format: mulaw 8kHz mono                                        │    │   │
│  │   └──────────────────────────────┬──────────────────────────────────────────┘    │   │
│  │                                  │                                                │   │
│  └──────────────────────────────────┼────────────────────────────────────────────────┘   │
│                                     │                                                    │
│                                     ▼                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                           APPLICATION LAYER                                       │   │
│  │                                                                                   │   │
│  │   ┌─────────────────────────────────────────────────────────────────────────┐    │   │
│  │   │                     Express Server (index.js)                            │    │   │
│  │   │                                                                          │    │   │
│  │   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │    │   │
│  │   │  │   HTTP      │  │  WebSocket  │  │  Pipeline   │  │  Scheduler  │     │    │   │
│  │   │  │   Routes    │  │   Handler   │  │   Router    │  │   (60s)     │     │    │   │
│  │   │  └─────────────┘  └─────────────┘  └──────┬──────┘  └─────────────┘     │    │   │
│  │   │                                           │                              │    │   │
│  │   └───────────────────────────────────────────┼──────────────────────────────┘    │   │
│  │                                               │                                   │   │
│  │                          ┌────────────────────┴────────────────────┐              │   │
│  │                          ▼                                         ▼              │   │
│  │   ┌──────────────────────────────────────┐  ┌──────────────────────────────────┐ │   │
│  │   │         V0 PIPELINE                  │  │         V1 PIPELINE              │ │   │
│  │   │      (GeminiLiveSession)             │  │     (V1AdvancedSession)          │ │   │
│  │   │                                      │  │                                  │ │   │
│  │   │  ┌────────────────────────────────┐  │  │  CRITICAL PATH:                  │ │   │
│  │   │  │      Gemini 2.5 Flash          │  │  │  ┌────────────────────────────┐  │ │   │
│  │   │  │      Native Audio              │  │  │  │       Deepgram STT         │  │ │   │
│  │   │  │  • Audio in → Audio out        │  │  │  └─────────────┬──────────────┘  │ │   │
│  │   │  │  • Built-in STT + TTS          │  │  │                │                 │ │   │
│  │   │  │  • ~500ms latency              │  │  │                ▼                 │ │   │
│  │   │  └────────────────────────────────┘  │  │  ┌────────────────────────────┐  │ │   │
│  │   │                                      │  │  │     Claude Sonnet          │  │ │   │
│  │   │  ┌────────────────────────────────┐  │  │  └─────────────┬──────────────┘  │ │   │
│  │   │  │    Deepgram (Parallel)         │  │  │                │                 │ │   │
│  │   │  │  • User speech transcription   │  │  │                ▼                 │ │   │
│  │   │  │  • Memory trigger detection    │  │  │  ┌────────────────────────────┐  │ │   │
│  │   │  └────────────────────────────────┘  │  │  │      ElevenLabs TTS        │  │ │   │
│  │   │                                      │  │  └─────────────┬──────────────┘  │ │   │
│  │   └──────────────────────────────────────┘  │                │                 │ │   │
│  │                                             │                ▼                 │ │   │
│  │   ┌──────────────────────────────────────┐  │        Audio to Twilio          │ │   │
│  │   │    PARALLEL (not in critical path)   │  │        ~1.5s latency            │ │   │
│  │   │                                      │  └──────────────────────────────────┘ │   │
│  │   │  ┌────────────────────────────────┐  │                                       │   │
│  │   │  │     Observer Agent             │  │  Listens to conversation history      │   │
│  │   │  │     (Background, every 30s)    │◄─┼──Signals used by NEXT Claude turn     │   │
│  │   │  │                                │  │  Never blocks current response        │   │
│  │   │  │  • Engagement analysis         │  │                                       │   │
│  │   │  │  • Emotional state detection   │  │                                       │   │
│  │   │  │  • Reminder timing signals     │  │                                       │   │
│  │   │  │  • Caregiver concern flags     │  │                                       │   │
│  │   │  └────────────────────────────────┘  │                                       │   │
│  │   └──────────────────────────────────────┘                                       │   │
│  │                                                                                   │   │
│  └───────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              SERVICE LAYER                                         │   │
│  │                                                                                    │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │   │
│  │   │   Memory    │  │   Senior    │  │Conversation │  │    News     │             │   │
│  │   │   Service   │  │   Service   │  │   Service   │  │   Service   │             │   │
│  │   │             │  │             │  │             │  │             │             │   │
│  │   │ • Store     │  │ • CRUD      │  │ • Create    │  │ • Fetch     │             │   │
│  │   │ • Search    │  │ • Find by   │  │ • Complete  │  │ • Cache     │             │   │
│  │   │ • Extract   │  │   phone     │  │ • Get for   │  │ • Format    │             │   │
│  │   │ • Build     │  │ • List      │  │   senior    │  │             │             │   │
│  │   │   context   │  │             │  │             │  │             │             │   │
│  │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │   │
│  │          │                │                │                │                     │   │
│  └──────────┼────────────────┼────────────────┼────────────────┼─────────────────────┘   │
│             │                │                │                │                         │
│             ▼                ▼                ▼                ▼                         │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              DATA LAYER                                            │   │
│  │                                                                                    │   │
│  │   ┌─────────────────────────────────────────────────────────────────────────┐     │   │
│  │   │                    PostgreSQL (Neon)                                     │     │   │
│  │   │                                                                          │     │   │
│  │   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │     │   │
│  │   │  │ seniors  │  │ memories │  │ conver-  │  │reminders │  │ (future) │  │     │   │
│  │   │  │          │  │          │  │ sations  │  │          │  │caregivers│  │     │   │
│  │   │  │• id      │  │• id      │  │• id      │  │• id      │  │          │  │     │   │
│  │   │  │• name    │  │• seniorId│  │• seniorId│  │• seniorId│  │          │  │     │   │
│  │   │  │• phone   │  │• type    │  │• callSid │  │• title   │  │          │  │     │   │
│  │   │  │• interest│  │• content │  │• started │  │• type    │  │          │  │     │   │
│  │   │  │• medical │  │• embedding│ │• duration│  │• schedule│  │          │  │     │   │
│  │   │  │• family  │  │  (vector)│  │• status  │  │• recurring│ │          │  │     │   │
│  │   │  │• isActive│  │• importance│• transcript│ │• lastDel │  │          │  │     │   │
│  │   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │     │   │
│  │   │                                                                          │     │   │
│  │   │                        pgvector extension                                │     │   │
│  │   │                   (1536-dimensional embeddings)                          │     │   │
│  │   └─────────────────────────────────────────────────────────────────────────┘     │   │
│  │                                                                                    │   │
│  └────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                           EXTERNAL SERVICES                                         │  │
│  │                                                                                     │  │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │  │
│  │   │  Twilio  │  │  Gemini  │  │  Claude  │  │ElevenLabs│  │ Deepgram │            │  │
│  │   │          │  │          │  │(Anthropic)│ │          │  │          │            │  │
│  │   │ • Calls  │  │ • V0 AI  │  │ • V1 AI  │  │ • V1 TTS │  │ • STT    │            │  │
│  │   │ • Media  │  │ • Native │  │ • Observer│ │ • Voices │  │ • Real-  │            │  │
│  │   │   Stream │  │   Audio  │  │          │  │          │  │   time   │            │  │
│  │   └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │  │
│  │                                                                                     │  │
│  │   ┌──────────┐  ┌──────────┐                                                       │  │
│  │   │  OpenAI  │  │  Neon    │                                                       │  │
│  │   │          │  │          │                                                       │  │
│  │   │• Embedding│ │• Postgres│                                                       │  │
│  │   │• Web     │  │• pgvector│                                                       │  │
│  │   │  Search  │  │• Hosting │                                                       │  │
│  │   └──────────┘  └──────────┘                                                       │  │
│  │                                                                                     │  │
│  └─────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Client Layer

#### Senior's Phone
- Any phone (landline or mobile)
- Calls Twilio number or receives calls
- Audio: PSTN telephony

#### Admin Dashboard (`/admin.html`)
- Single-page application
- 4 tabs: Dashboard, Seniors, Calls, Reminders
- Pipeline selector (V0/V1)
- Pure HTML/CSS/JS (no build step)

#### Browser Test Call (`/browser-call`)
- WebSocket-based testing
- Direct microphone → WebSocket → AI
- For development/testing without phone

---

### 2. Gateway Layer (Twilio)

```
┌─────────────────────────────────────────────────────────────────────┐
│                           TWILIO FLOW                                │
│                                                                      │
│   INBOUND CALL                        OUTBOUND CALL                  │
│   ────────────                        ─────────────                  │
│   Phone → Twilio                      API /api/call                  │
│      │                                     │                         │
│      ▼                                     ▼                         │
│   POST /voice/answer              twilioClient.calls.create()        │
│      │                                     │                         │
│      │◄────────────────────────────────────┘                         │
│      │                                                               │
│      ▼                                                               │
│   TwiML Response:                                                    │
│   <Connect><Stream url="wss://.../media-stream"/></Connect>          │
│      │                                                               │
│      ▼                                                               │
│   WebSocket /media-stream                                            │
│      │                                                               │
│      ├──► event: 'start'  → Create session, get callSid             │
│      │                                                               │
│      ├──► event: 'media'  → Audio chunk (base64 mulaw)              │
│      │                       Forward to pipeline                     │
│      │                                                               │
│      ├──► event: 'stop'   → Stream ending                           │
│      │                                                               │
│      ▼                                                               │
│   POST /voice/status                                                 │
│      │                                                               │
│      └──► completed/failed → Extract memories, save transcript       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Audio Format:**
- Twilio sends: mulaw 8kHz mono (base64 encoded)
- Gemini expects: PCM 16kHz
- ElevenLabs returns: PCM 24kHz
- Conversion: `audio-utils.js`

---

### 3. Application Layer

#### HTTP Routes (`index.js`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/health` | GET | Health check, pipeline info |
| `/voice/answer` | POST | Twilio call webhook |
| `/voice/status` | POST | Call status updates |
| `/api/call` | POST | Initiate outbound call |
| `/api/seniors` | GET/POST | List/create seniors |
| `/api/seniors/:id` | GET/PATCH | Get/update senior |
| `/api/seniors/:id/memories` | GET/POST | List/create memories |
| `/api/seniors/:id/memories/search` | GET | Semantic search |
| `/api/conversations` | GET | List conversations |
| `/api/reminders` | GET/POST | List/create reminders |
| `/api/reminders/:id` | PATCH/DELETE | Update/delete reminder |
| `/api/stats` | GET | Dashboard statistics |

#### WebSocket Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/media-stream` | Twilio Media Streams |
| `/browser-call` | Browser-based testing |

#### Pipeline Router

```javascript
// Simplified routing logic
const pipeline = metadata.pipeline || 'v0';

if (pipeline === 'v1') {
  session = new V1AdvancedSession(ws, streamSid, senior, context);
} else {
  session = new GeminiLiveSession(ws, streamSid, senior, context);
}
```

---

### 4. V0 Pipeline (Gemini Native)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        V0 PIPELINE FLOW                              │
│                                                                      │
│   Twilio Audio (mulaw 8kHz)                                         │
│        │                                                             │
│        ├───────────────────────────┐                                 │
│        │                           │                                 │
│        ▼                           ▼                                 │
│   ┌─────────────┐           ┌─────────────┐                         │
│   │   Convert   │           │  Deepgram   │ (Parallel)              │
│   │  mulaw →    │           │    STT      │                         │
│   │  PCM 16kHz  │           │             │                         │
│   └──────┬──────┘           └──────┬──────┘                         │
│          │                         │                                 │
│          ▼                         │                                 │
│   ┌─────────────────────┐          │                                 │
│   │   Gemini 2.5 Flash  │          │                                 │
│   │   Native Audio API  │          ▼                                 │
│   │                     │   ┌─────────────┐                         │
│   │ • Audio in          │   │  Transcript │                         │
│   │ • AI processing     │   │  Analysis   │                         │
│   │ • Audio out         │   │             │                         │
│   │                     │   │ Memory      │                         │
│   └──────────┬──────────┘   │ triggers?   │                         │
│              │              └──────┬──────┘                         │
│              │                     │                                 │
│              │                     ▼                                 │
│              │              ┌─────────────┐                         │
│              │              │  Memory     │                         │
│              │              │  Injection  │ (If trigger detected)   │
│              │              └──────┬──────┘                         │
│              │                     │                                 │
│              │◄────────────────────┘ (Context fed to Gemini)        │
│              │                                                       │
│              ▼                                                       │
│   ┌─────────────┐                                                   │
│   │   Convert   │                                                   │
│   │  PCM 24kHz  │                                                   │
│   │  → mulaw    │                                                   │
│   └──────┬──────┘                                                   │
│          │                                                           │
│          ▼                                                           │
│   Twilio (back to phone)                                            │
│                                                                      │
│   Latency: ~500ms                                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Files:**
- `gemini-live.js` - Session handler
- `audio-utils.js` - Format conversion

**Gemini Configuration:**
```javascript
{
  model: 'gemini-2.5-flash-native-audio-preview',
  responseModalities: [Modality.AUDIO],
  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: { voiceName: 'Aoede' }
    }
  },
  inputAudioTranscription: {},
  outputAudioTranscription: {}
}
```

---

### 5. V1 Pipeline (Claude + Observer)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        V1 PIPELINE FLOW                              │
│                                                                      │
│   ════════════════════════════════════════════════════════════════  │
│   CRITICAL PATH (adds to latency)          PARALLEL (no latency)    │
│   ════════════════════════════════════════════════════════════════  │
│                                                                      │
│   Twilio Audio (mulaw 8kHz)                                         │
│        │                                                             │
│        ▼                                                             │
│   ┌─────────────┐                                                   │
│   │  Deepgram   │  ◄─── WebSocket connection                        │
│   │    STT      │       model: nova-2                               │
│   └──────┬──────┘                                                   │
│          │                                                           │
│          │ Transcript ─────────────────────┐                        │
│          │                                 │                        │
│          ▼                                 ▼                        │
│   ┌─────────────┐                 ┌──────────────────┐              │
│   │   Claude    │                 │  Observer Agent  │ PARALLEL     │
│   │   Sonnet    │                 │  (every 30s)     │ (async)      │
│   │             │                 │                  │              │
│   │ Uses last   │◄── signals ────│ Analyzes full    │              │
│   │ observer    │    (from       │ conversation     │              │
│   │ signal      │    previous    │ history          │              │
│   │             │    analysis)   │                  │              │
│   └──────┬──────┘                 │ Outputs:         │              │
│          │                        │ • Engagement     │              │
│          │ Text response          │ • Emotion        │              │
│          │                        │ • Reminder time  │              │
│          ▼                        │ • Concerns       │              │
│   ┌─────────────┐                 └──────────────────┘              │
│   │ ElevenLabs  │                        │                          │
│   │    TTS      │                        │                          │
│   └──────┬──────┘                        ▼                          │
│          │                        Stored for NEXT turn              │
│          │                        (never blocks current)            │
│          ▼                                                           │
│   ┌─────────────┐                                                   │
│   │   Convert   │                                                   │
│   │  → mulaw    │                                                   │
│   └──────┬──────┘                                                   │
│          │                                                           │
│          ▼                                                           │
│   Twilio (back to phone)                                            │
│                                                                      │
│   ════════════════════════════════════════════════════════════════  │
│   CRITICAL PATH LATENCY: ~1.5s (target: <600ms)                     │
│   OBSERVER LATENCY: 0ms (runs in background, doesn't block)         │
│   ════════════════════════════════════════════════════════════════  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Observer Agent Design:**
- Runs on a 30-second interval (configurable)
- Analyzes the full conversation history
- Results stored in `lastObserverSignal`
- Used by the NEXT Claude response, not the current one
- Never awaited in the response critical path
- If analysis takes 2-3 seconds, it doesn't matter - user doesn't wait

**Key Files:**
- `pipelines/v1-advanced.js` - Session handler
- `pipelines/observer-agent.js` - Conversation analyzer
- `adapters/elevenlabs.js` - TTS adapter

**Observer Agent Output:**
```javascript
{
  engagement_level: 'high' | 'medium' | 'low',
  emotional_state: 'happy' | 'confused' | 'tired' | ...,
  should_deliver_reminder: boolean,
  reminder_to_deliver: 'reminder_id',
  suggested_topic: 'topic suggestion',
  should_end_call: boolean,
  end_call_reason: 'reason',
  concerns: ['concern1', 'concern2']
}
```

---

### 6. Service Layer

#### Memory Service (`services/memory.js`)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MEMORY SYSTEM                                 │
│                                                                      │
│   STORE                          RETRIEVE                            │
│   ─────                          ────────                            │
│   Content                        Query                               │
│      │                              │                                │
│      ▼                              ▼                                │
│   ┌─────────┐                 ┌─────────┐                           │
│   │ OpenAI  │                 │ OpenAI  │                           │
│   │Embedding│                 │Embedding│                           │
│   │  API    │                 │  API    │                           │
│   └────┬────┘                 └────┬────┘                           │
│        │                           │                                 │
│        │ 1536-dim vector           │ 1536-dim vector                │
│        ▼                           ▼                                 │
│   ┌─────────────────────────────────────┐                           │
│   │         PostgreSQL + pgvector       │                           │
│   │                                     │                           │
│   │  INSERT INTO memories              │                           │
│   │  (content, embedding, ...)         │                           │
│   │                                     │                           │
│   │  SELECT * FROM memories            │                           │
│   │  WHERE senior_id = ?               │                           │
│   │  ORDER BY embedding <=> query_vec  │  ◄── Cosine similarity    │
│   │  LIMIT 5                           │                           │
│   └─────────────────────────────────────┘                           │
│                                                                      │
│   MEMORY TYPES:                                                      │
│   • fact        - General information                               │
│   • preference  - Likes/dislikes                                    │
│   • event       - Past events                                       │
│   • concern     - Health/emotional                                  │
│   • relationship- People in their life                              │
│                                                                      │
│   EXTRACTION (at call end):                                         │
│   Transcript → OpenAI → Structured facts → Store with embeddings    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### Scheduler Service (`services/scheduler.js`)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SCHEDULER SYSTEM                                │
│                                                                      │
│   Server Start                                                       │
│        │                                                             │
│        ▼                                                             │
│   startScheduler(baseUrl, 60000)  ◄── Check every 60 seconds        │
│        │                                                             │
│        ▼                                                             │
│   ┌─────────────────┐                                               │
│   │  getDueReminders │                                               │
│   │                  │                                               │
│   │  • Non-recurring │ scheduledTime <= now AND lastDeliveredAt NULL │
│   │  • Recurring     │ Match time-of-day, >23h since last delivery  │
│   └────────┬─────────┘                                               │
│            │                                                         │
│            ▼                                                         │
│   For each due reminder:                                            │
│        │                                                             │
│        ▼                                                             │
│   ┌─────────────────┐                                               │
│   │ PRE-FETCH       │ ◄── Build context BEFORE calling Twilio       │
│   │ • Senior profile│     (reduces lag when call connects)          │
│   │ • Memory context│                                                │
│   │ • Reminder prompt│                                               │
│   └────────┬─────────┘                                               │
│            │                                                         │
│            ▼                                                         │
│   twilioClient.calls.create()                                       │
│        │                                                             │
│        ▼                                                             │
│   Store pre-fetched context in pendingReminderCalls Map             │
│        │                                                             │
│        ▼                                                             │
│   markDelivered(reminderId)                                         │
│                                                                      │
│   When /voice/answer receives call:                                 │
│   → Retrieve pre-fetched context from Map                           │
│   → Inject reminder prompt into system prompt                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### News Service (`services/news.js`)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NEWS SYSTEM                                   │
│                                                                      │
│   Senior Profile (interests: ['gardening', 'baseball'])             │
│        │                                                             │
│        ▼                                                             │
│   ┌─────────────────┐                                               │
│   │  Check Cache    │ ◄── 1-hour TTL                                │
│   │  (by seniorId)  │                                               │
│   └────────┬────────┘                                               │
│            │                                                         │
│            │ Cache miss                                              │
│            ▼                                                         │
│   ┌─────────────────────────────────────┐                           │
│   │     OpenAI Responses API            │                           │
│   │     with web_search tool            │                           │
│   │                                     │                           │
│   │  "Find 2-3 positive, uplifting      │                           │
│   │   news headlines about:             │                           │
│   │   gardening, baseball               │                           │
│   │   Suitable for elderly audience"    │                           │
│   └────────────────┬────────────────────┘                           │
│                    │                                                 │
│                    ▼                                                 │
│   Format as conversation context:                                   │
│   "Recent news you might find interesting:                          │
│    - Local garden show this weekend...                              │
│    - Baseball team wins championship..."                            │
│                                                                      │
│   Store in cache, return for system prompt                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 7. Data Layer

#### Database Schema (`db/schema.js`)

```sql
-- Seniors table
CREATE TABLE seniors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  phone VARCHAR NOT NULL,
  interests TEXT[],
  medical_notes TEXT,
  family_info JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Memories table (with vector embeddings)
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  senior_id UUID REFERENCES seniors(id),
  type VARCHAR NOT NULL,           -- fact, preference, event, concern, relationship
  content TEXT NOT NULL,
  embedding VECTOR(1536),          -- OpenAI embedding
  source VARCHAR,                  -- manual, extracted, observed
  importance INTEGER DEFAULT 50,   -- 0-100
  conversation_ref VARCHAR,        -- callSid if extracted from call
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for vector similarity search
CREATE INDEX ON memories USING ivfflat (embedding vector_cosine_ops);

-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  senior_id UUID REFERENCES seniors(id),
  call_sid VARCHAR,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  status VARCHAR,                  -- completed, failed, no-answer
  transcript JSONB,                -- [{role, content, timestamp}, ...]
  summary TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reminders table
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  senior_id UUID REFERENCES seniors(id),
  type VARCHAR DEFAULT 'custom',   -- medication, appointment, custom
  title VARCHAR NOT NULL,
  description TEXT,
  scheduled_time TIMESTAMP,
  is_recurring BOOLEAN DEFAULT false,
  cron_expression VARCHAR,         -- For recurring: '0 9 * * *'
  is_active BOOLEAN DEFAULT true,
  last_delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 8. Call Flow Sequence

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Phone   │     │  Twilio  │     │  Server  │     │ Pipeline │     │    AI    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │  Dial number   │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ POST /voice/answer              │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ Lookup senior  │                │
     │                │                │ Build context  │                │
     │                │                │                │                │
     │                │ TwiML (Stream) │                │                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │                │ WebSocket /media-stream         │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ event: start   │                │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │                │                │ Connect to AI  │
     │                │                │                │───────────────>│
     │                │                │                │                │
     │                │                │                │  Send greeting │
     │                │                │                │<───────────────│
     │                │                │                │                │
     │                │                │  Audio out     │                │
     │                │<───────────────│<───────────────│                │
     │                │                │                │                │
     │  Hear greeting │                │                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
     │  Speak         │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ event: media   │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ Forward audio  │                │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │                │                │ Process audio  │
     │                │                │                │───────────────>│
     │                │                │                │                │
     │                │                │                │ Generate resp  │
     │                │                │                │<───────────────│
     │                │                │                │                │
     │                │                │  Audio out     │                │
     │                │<───────────────│<───────────────│                │
     │                │                │                │                │
     │  Hear response │                │                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
     │      ...       │      ...       │      ...       │      ...       │
     │                │                │                │                │
     │  Hang up       │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ POST /voice/status (completed)  │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ Extract memories                │
     │                │                │ Save transcript                 │
     │                │                │ Close session  │                │
     │                │                │───────────────>│                │
     │                │                │                │                │
```

---

### 9. File Structure

```
donna/
├── index.js                    # Main Express server
│                               # - HTTP routes
│                               # - WebSocket handlers
│                               # - Pipeline routing
│
├── gemini-live.js              # V0 Pipeline session
│                               # - Gemini native audio
│                               # - Deepgram parallel STT
│                               # - Memory triggers
│
├── browser-session.js          # Browser test call session
│
├── audio-utils.js              # Audio format conversion
│                               # - mulaw ↔ PCM
│                               # - Sample rate conversion
│
├── pipelines/
│   ├── v1-advanced.js          # V1 Pipeline session
│   │                           # - Deepgram STT
│   │                           # - Claude LLM
│   │                           # - ElevenLabs TTS
│   │
│   └── observer-agent.js       # Conversation analyzer
│                               # - Engagement tracking
│                               # - Emotional analysis
│                               # - Reminder timing
│
├── adapters/
│   └── elevenlabs.js           # ElevenLabs TTS adapter
│                               # - Text to speech
│                               # - Streaming support
│
├── services/
│   ├── seniors.js              # Senior CRUD operations
│   ├── memory.js               # Memory storage + search
│   ├── conversations.js        # Conversation records
│   ├── scheduler.js            # Reminder scheduler
│   └── news.js                 # News via OpenAI
│
├── db/
│   ├── client.js               # Database connection (Drizzle)
│   └── schema.js               # Table definitions
│
├── public/
│   └── admin.html              # Admin dashboard UI
│
├── docs/
│   ├── ARCHITECTURE.md         # This file
│   ├── NEXT_STEPS.md           # Implementation roadmap
│   └── plans/                  # Design documents
│
├── package.json
├── railway.json                # Railway deployment config
├── CLAUDE.md                   # AI assistant context
└── README.md                   # Project overview
```

---

### 10. Environment Configuration

```bash
# ═══════════════════════════════════════════════════════════════
# REQUIRED - Core Infrastructure
# ═══════════════════════════════════════════════════════════════
PORT=3001
DATABASE_URL=postgresql://user:pass@host:5432/donna

# ═══════════════════════════════════════════════════════════════
# REQUIRED - Twilio (Phone Calls)
# ═══════════════════════════════════════════════════════════════
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890

# ═══════════════════════════════════════════════════════════════
# REQUIRED - AI Services
# ═══════════════════════════════════════════════════════════════
OPENAI_API_KEY=sk-...              # Embeddings + news search
GOOGLE_API_KEY=...                  # V0: Gemini 2.5 Flash

# ═══════════════════════════════════════════════════════════════
# V1 PIPELINE - Required if using V1
# ═══════════════════════════════════════════════════════════════
ANTHROPIC_API_KEY=sk-ant-...        # Claude Sonnet
ELEVENLABS_API_KEY=...              # Text-to-speech
DEEPGRAM_API_KEY=...                # Speech-to-text

# ═══════════════════════════════════════════════════════════════
# OPTIONAL - Configuration
# ═══════════════════════════════════════════════════════════════
DEFAULT_PIPELINE=v0                 # v0 or v1
RAILWAY_PUBLIC_DOMAIN=...           # Auto-set by Railway
```

---

### 11. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RAILWAY                                      │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    donna-api                                 │   │
│   │                                                              │   │
│   │   • Express server (Node.js 20)                             │   │
│   │   • Auto-deploy from GitHub                                 │   │
│   │   • Environment variables                                   │   │
│   │   • Custom domain: donna-api-production-xxxx.up.railway.app │   │
│   │                                                              │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              │ DATABASE_URL                          │
│                              ▼                                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    Neon PostgreSQL                           │   │
│   │                                                              │   │
│   │   • Serverless Postgres                                     │   │
│   │   • pgvector extension                                      │   │
│   │   • Auto-scaling                                            │   │
│   │                                                              │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         TWILIO                                       │
│                                                                      │
│   Phone Number: +1-XXX-XXX-XXXX                                     │
│                                                                      │
│   Webhook Configuration:                                            │
│   • Voice URL: https://donna-api-xxx.up.railway.app/voice/answer   │
│   • Status Callback: https://donna-api-xxx.up.railway.app/voice/status │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 12. Security Considerations

| Area | Current State | Recommendation |
|------|---------------|----------------|
| **API Auth** | None (open) | Add Clerk/Auth0 |
| **Admin Access** | Public URL | Password protect |
| **Database** | Neon managed | SSL enforced |
| **API Keys** | Env vars | Rotate quarterly |
| **Phone Numbers** | Verified | Twilio verified only |
| **Data Encryption** | At rest (Neon) | Add field-level |
| **Audit Logging** | Console only | Add to database |

---

### 13. Monitoring & Observability

**Current:**
- Console logging (`[CallSid] message`)
- Railway logs dashboard
- Twilio call logs

**Recommended Additions:**
- Structured logging (JSON)
- Latency metrics per component
- Error rate tracking
- Call quality scores
- Observer signal history

---

*Last updated: January 18, 2026*
