# Donna - AI Senior Companion

AI-powered companion that provides elderly individuals with friendly phone conversations via real-time voice AI.

## Features

- **4-Layer Observer Architecture** - Intelligent conversation analysis
  - Layer 1: Quick Observer (0ms) - Instant regex patterns
  - Layer 2: Fast Observer (~300ms) - Haiku + memory search
  - Layer 3: Deep Observer (~800ms) - Sonnet analysis (async)
  - Layer 4: Post-Turn Agent - Background tasks after response
- **Dynamic Model Routing** - Automatic Haiku/Sonnet selection based on context
- **Streaming Pipeline** - ~400ms time-to-first-audio
  - Pre-built greeting
  - Claude streaming responses
  - WebSocket TTS (ElevenLabs)
  - Sentence-by-sentence audio delivery
- Real-time voice calls (Twilio Media Streams)
- Speech transcription (Deepgram STT)
- Memory system with semantic search (pgvector)
- News updates (OpenAI web search)
- Scheduled reminder calls
- Admin dashboard
- Observability dashboard

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
Phone Call → Twilio → WebSocket → Donna Pipeline
                                       │
                    ┌──────────────────┴──────────────────┐
                    │         4-LAYER OBSERVERS           │
                    ├─────────────────────────────────────┤
                    │                                     │
User speaks → Deepgram STT → Process utterance            │
                                  │                       │
                  ┌───────────────┼───────────────┐       │
                  ▼               ▼               ▼       │
            Layer 1 (0ms)   Layer 2 (~300ms)  Layer 3     │
            Quick Observer  Fast Observer     Deep Observer
            (regex)         (Haiku+memory)    (Sonnet)    │
                  │               │               │       │
                  └───────┬───────┘               │       │
                          ▼                       │       │
              ┌─────────────────────┐             │       │
              │ Dynamic Model Select│←────────────┘       │
              │ (Haiku or Sonnet)   │         (next turn) │
              └──────────┬──────────┘                     │
                         ▼                                │
              Claude Streaming Response                   │
                         │                                │
                         ▼                                │
              Sentence Buffer → ElevenLabs WS → Twilio    │
                         │                                │
                         ▼                                │
              Layer 4: Post-Turn Agent (background)       │
              - Health concern extraction                 │
              - Memory storage                            │
              - Topic prefetching                         │
                                                          │
                    └─────────────────────────────────────┘
```

## Dynamic Model Routing

The system automatically selects the best model based on conversation context:

| Situation | Model | Tokens | Reason |
|-----------|-------|--------|--------|
| Normal conversation | Haiku | 75 | Fast, efficient |
| Health mention | Sonnet | 150 | Safety needs nuance |
| Emotional support | Sonnet | 150 | Empathy needs depth |
| Low engagement | Sonnet | 120 | Creative re-engagement |
| Simple question | Haiku | 60 | Quick answers better |
| Important memory | Sonnet | 150 | Personalized response |

## Project Structure

```
donna/
├── index.js                    # Main server
├── pipelines/
│   ├── v1-advanced.js          # Main pipeline + dynamic routing
│   ├── observer-agent.js       # Layer 3: Deep conversation analyzer
│   ├── quick-observer.js       # Layer 1: Instant regex patterns
│   ├── fast-observer.js        # Layer 2: Haiku + memory search
│   └── post-turn-agent.js      # Layer 4: Background tasks
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
# Required
PORT=3001
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
DATABASE_URL=postgresql://...
OPENAI_API_KEY=...              # Embeddings + news search
ANTHROPIC_API_KEY=...           # Claude (Haiku + Sonnet)
ELEVENLABS_API_KEY=...          # TTS
DEEPGRAM_API_KEY=...            # STT

# Optional
V1_STREAMING_ENABLED=true       # Set to 'false' to disable streaming
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/voice/answer` | POST | Twilio webhook for calls |
| `/voice/status` | POST | Call status updates |
| `/api/call` | POST | Initiate call (`{phoneNumber}`) |
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
- [docs/DYNAMIC_MODEL_ROUTING.md](./docs/DYNAMIC_MODEL_ROUTING.md) - Model selection logic
- [docs/STREAMING_OBSERVER_SPEC.md](./docs/STREAMING_OBSERVER_SPEC.md) - Streaming pipeline design
- [CLAUDE.md](./CLAUDE.md) - AI assistant context

## License

Private - All rights reserved
