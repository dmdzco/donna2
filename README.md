# Donna - AI Senior Companion

AI-powered companion that provides elderly individuals with friendly phone conversations via real-time voice AI.

## Current Status: v2.4 (Dual Pipeline)

**Working Features:**
- **Dual Pipeline Architecture** - Select V0 or V1 from admin UI
  - **V0**: Gemini 2.5 Native Audio (low latency, default)
  - **V1**: Claude + Observer Agent + ElevenLabs (higher quality, more control)
- Real-time voice calls (Twilio Media Streams)
- User speech transcription (Deepgram STT)
- Mid-conversation memory retrieval (keyword triggers)
- News updates (OpenAI web search, based on interests)
- Scheduled reminder calls (auto-triggers when due)
- Enhanced admin dashboard (4 tabs)
- Senior profile management
- Memory system with semantic search (pgvector + OpenAI)
- Memory extraction from conversations

## Quick Start

```bash
npm install
npm run dev
```

Test health:
```bash
curl http://localhost:3001/health
```

Admin dashboard: `http://localhost:3001/admin.html`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DUAL PIPELINE                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Phone Call → Twilio → WebSocket → Pipeline Router          │
│                                           │                  │
│                         ┌─────────────────┴─────────────────┐│
│                         ▼                                   ▼│
│               ┌─────────────────┐             ┌─────────────────┐
│               │  V0: Gemini     │             │  V1: Claude     │
│               │  Native Audio   │             │  + Observer     │
│               │  (AI + TTS)     │             │  + ElevenLabs   │
│               └────────┬────────┘             └────────┬────────┘
│                        │                               │        │
│                        └───────────────┬───────────────┘        │
│                                        ▼                        │
│                              PostgreSQL + pgvector              │
│                              (Memories & Profiles)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Pipeline Comparison

| Feature | V0 (Gemini) | V1 (Claude) |
|---------|-------------|-------------|
| **Latency** | ~500ms | ~1.5-2s |
| **AI Model** | Gemini 2.5 Flash | Claude Sonnet |
| **TTS** | Built-in | ElevenLabs |
| **Observer Agent** | No | Yes (every 30s) |
| **Best For** | Quick responses | Quality + insights |

## Tech Stack

| Component | V0 | V1 | Shared |
|-----------|----|----|--------|
| **Voice AI** | Gemini 2.5 Flash | Claude Sonnet | - |
| **STT** | Deepgram (parallel) | Deepgram | - |
| **TTS** | Gemini Native | ElevenLabs | - |
| **Phone** | - | - | Twilio Media Streams |
| **Database** | - | - | Neon PostgreSQL + pgvector |
| **Hosting** | - | - | Railway |

## Project Structure

```
donna/
├── index.js                    # Main server + pipeline router
├── gemini-live.js              # V0: Gemini native audio session
├── pipelines/
│   ├── v1-advanced.js          # V1: Claude + Observer session
│   └── observer-agent.js       # Conversation analyzer
├── adapters/
│   └── elevenlabs.js           # ElevenLabs TTS
├── services/
│   ├── memory.js               # Memory storage + semantic search
│   ├── seniors.js              # Senior profile CRUD
│   ├── conversations.js        # Conversation history
│   ├── scheduler.js            # Reminder scheduler
│   └── news.js                 # News via OpenAI web search
├── db/
│   ├── client.js               # Database connection
│   └── schema.js               # Drizzle ORM schema
├── public/
│   └── admin.html              # Admin UI (4 tabs + pipeline selector)
└── audio-utils.js              # Audio format conversion
```

## Environment Variables

```bash
# ============ REQUIRED (Both Pipelines) ============
PORT=3001
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
DATABASE_URL=postgresql://...
OPENAI_API_KEY=...              # Embeddings + news search

# ============ V0 PIPELINE ============
GOOGLE_API_KEY=...              # Gemini 2.5 Flash

# ============ V1 PIPELINE ============
ANTHROPIC_API_KEY=...           # Claude Sonnet
ELEVENLABS_API_KEY=...          # TTS
DEEPGRAM_API_KEY=...            # STT (also used by V0)

# ============ OPTIONAL ============
DEFAULT_PIPELINE=v0             # v0 or v1
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with pipeline info |
| `/voice/answer` | POST | Twilio webhook for calls |
| `/voice/status` | POST | Call status updates |
| `/api/call` | POST | Initiate call (`{phoneNumber, pipeline}`) |
| `/api/seniors` | GET/POST | Manage senior profiles |
| `/api/seniors/:id` | GET/PATCH | Get/update senior |
| `/api/seniors/:id/memories` | GET/POST | Manage memories |
| `/api/conversations` | GET | View conversation history |
| `/api/reminders` | GET/POST | Manage reminders |
| `/api/reminders/:id` | PATCH/DELETE | Update/delete reminder |
| `/api/stats` | GET | Dashboard statistics |

## Admin Dashboard

Access at `/admin.html` with 4 tabs:
- **Dashboard** - Stats, recent calls, upcoming reminders
- **Seniors** - Add/edit/delete seniors, manage memories
- **Calls** - Call history with transcripts
- **Reminders** - Create recurring/one-time reminders

**Pipeline Selector**: Dropdown in header to switch between V0/V1

## Memory System

**Flow:**
1. **Call Start**: Load relevant memories + news into system prompt
2. **During Call**: Deepgram transcribes → keyword triggers → memory injection
3. **Call End**: Extract facts/preferences, store with embeddings

**Memory Types:** `fact`, `preference`, `event`, `concern`, `relationship`

## Observer Agent (V1 Only)

Analyzes conversation every 30 seconds:
- **Engagement level** - high/medium/low
- **Emotional state** - happy, confused, tired, etc.
- **Reminder timing** - when to naturally deliver reminders
- **Concerns** - issues to flag for caregivers

## Deployment

**Railway:**
1. Push to GitHub
2. Connect repo on [railway.app](https://railway.app)
3. Add environment variables
4. Deploy (auto-deploys on push)

## Version History

- **v2.4** - Dual pipeline (V0 Gemini / V1 Claude+Observer+ElevenLabs)
- **v2.3** - Scheduled reminder calls
- **v2.2** - Enhanced admin dashboard (4 tabs)
- **v2.1** - Deepgram STT, mid-call memory, news updates
- **v2.0** - Full voice calls with memory
- **v1.0** - Basic Twilio integration

## Documentation

- [CLAUDE.md](./CLAUDE.md) - AI assistant context (architecture, files)
- [docs/NEXT_STEPS.md](./docs/NEXT_STEPS.md) - Implementation roadmap

## License

Private - All rights reserved
