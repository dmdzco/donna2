# Donna - AI Senior Companion

AI-powered companion that provides elderly individuals with friendly phone conversations via real-time voice AI.

## Features

- **Dual Pipeline Architecture** - Select V0 or V1 from admin UI
  - **V0**: Gemini 2.5 Native Audio (low latency)
  - **V1**: Claude Streaming + Multi-layer Observers (higher quality)
- **V1 Streaming Pipeline** (NEW in v2.5)
  - Pre-built greeting (~400ms vs ~1.5s)
  - Claude streaming responses
  - WebSocket TTS (ElevenLabs)
  - 3-layer observer architecture
- Real-time voice calls (Twilio Media Streams)
- User speech transcription (Deepgram STT)
- Mid-conversation memory retrieval
- News updates (OpenAI web search)
- Scheduled reminder calls
- Admin dashboard (4 tabs)
- Senior profile management
- Memory system with semantic search (pgvector)
- **Observability Dashboard** - Call flow visualization

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
Observability: `http://localhost:5174` (run `npm run dev` in `apps/observability/`)

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
│               │  Native Audio   │             │  Streaming +    │
│               │  (~500ms)       │             │  3-Layer Observer│
│               └────────┬────────┘             └────────┬────────┘
│                        │                               │        │
│                        └───────────────┬───────────────┘        │
│                                        ▼                        │
│                              PostgreSQL + pgvector              │
│                              (Memories & Profiles)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### V1 Streaming Architecture

```
User speaks → Deepgram STT → Process utterance
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              Layer 1 (0ms)   Layer 2 (~300ms)  Layer 3 (~800ms)
              Quick Observer  Fast Observer     Deep Observer
              (regex)         (Haiku+memory)    (Sonnet)
                    │               │               │
                    └───────┬───────┘               │
                            ▼                       │
                    Claude Streaming ←──────────────┘
                            │                 (next turn)
                            ▼
                    Sentence Buffer → ElevenLabs WS → Twilio
```

## Pipeline Comparison

| Feature | V0 (Gemini) | V1 (Claude Streaming) |
|---------|-------------|----------------------|
| **Greeting** | ~500ms | ~400ms (pre-built) |
| **Response** | ~500ms | ~800ms (streaming) |
| **AI Model** | Gemini 2.5 Flash | Claude Sonnet |
| **TTS** | Built-in | ElevenLabs WebSocket |
| **Observer** | No | 3 layers |
| **Best For** | Quick responses | Quality + insights |

## Project Structure

```
donna/
├── index.js                    # Main server + pipeline router
├── gemini-live.js              # V0: Gemini native audio session
├── pipelines/
│   ├── v1-advanced.js          # V1: Streaming Claude + Observers
│   ├── observer-agent.js       # Layer 3: Deep conversation analyzer
│   ├── quick-observer.js       # Layer 1: Instant regex patterns
│   └── fast-observer.js        # Layer 2: Haiku + memory search
├── adapters/
│   ├── elevenlabs.js           # ElevenLabs REST TTS
│   └── elevenlabs-streaming.js # ElevenLabs WebSocket TTS
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
│   └── admin.html              # Admin UI
├── apps/
│   └── observability/          # React observability dashboard
└── audio-utils.js              # Audio format conversion
```

## Environment Variables

```bash
# Required (Both Pipelines)
PORT=3001
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
DATABASE_URL=postgresql://...
OPENAI_API_KEY=...              # Embeddings + news search

# V0 Pipeline
GOOGLE_API_KEY=...              # Gemini 2.5 Flash

# V1 Pipeline
ANTHROPIC_API_KEY=...           # Claude Sonnet
ELEVENLABS_API_KEY=...          # TTS
DEEPGRAM_API_KEY=...            # STT (also used by V0)

# Optional
DEFAULT_PIPELINE=v1             # v0 or v1
V1_STREAMING_ENABLED=true       # Set to 'false' to disable streaming
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
| `/api/observability/*` | GET | Observability data |

## Deployment

**Railway:**
1. Push to GitHub
2. Connect repo on [railway.app](https://railway.app)
3. Add environment variables
4. Deploy (auto-deploys on push)

Or deploy directly:
```bash
railway up
```

## Documentation

- [docs/architecture/OVERVIEW.md](./docs/architecture/OVERVIEW.md) - System architecture
- [docs/NEXT_STEPS.md](./docs/NEXT_STEPS.md) - Roadmap
- [CLAUDE.md](./CLAUDE.md) - AI assistant context
- [docs/STREAMING_OBSERVER_SPEC.md](./docs/STREAMING_OBSERVER_SPEC.md) - Streaming pipeline design
- [docs/plans/](./docs/plans/) - Design documents

## License

Private - All rights reserved
