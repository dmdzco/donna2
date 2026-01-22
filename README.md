# Donna - AI Senior Companion

AI-powered companion that provides elderly individuals with friendly phone conversations via real-time voice AI.

## Features

### Voice Pipeline
- **2-Layer Conversation Director Architecture**
  - Layer 1: Quick Observer (0ms) - 730+ regex patterns for health, emotion, safety
  - Layer 2: Conversation Director (~150ms) - Gemini 3 Flash for call guidance
  - Post-Call Analysis - Summary, concerns, engagement score
- **Dynamic Token Routing** - 100-400 tokens based on context
- **Streaming Pipeline** - ~600ms time-to-first-audio
  - Claude streaming responses (sentence-by-sentence)
  - ElevenLabs WebSocket TTS
  - Barge-in support (interrupt detection)

### Core Capabilities
- Real-time voice calls (Twilio Media Streams)
- Speech transcription (Deepgram Nova 2)
- Semantic memory with decay + deduplication (pgvector)
- News updates (OpenAI web search)
- Scheduled reminder calls with delivery tracking
- Admin dashboard (4 tabs)
- Observability dashboard (React)

## Quick Start

```bash
npm install
npm run dev
```

Test health:
```bash
curl http://localhost:3001/health
```

Admin dashboard: `http://localhost:5173` (run `npm run dev` in `apps/admin/`)
Observability: `http://localhost:5174` (run `npm run dev` in `apps/observability/`)
Legacy admin: `http://localhost:3001/admin.html` (fallback)

## Architecture

```
Phone Call → Twilio → WebSocket → Donna Pipeline
                                       │
                    ┌──────────────────┴──────────────────┐
                    │    CONVERSATION DIRECTOR ARCH       │
                    ├─────────────────────────────────────┤
                    │                                     │
User speaks → Deepgram STT → Process utterance            │
                                  │                       │
                  ┌───────────────┼───────────────┐       │
                  ▼               ▼                       │
            Layer 1 (0ms)   Layer 2 (~150ms)              │
            Quick Observer  Conversation Director         │
            (regex)         (Gemini 3 Flash)              │
                  │               │                       │
                  └───────┬───────┘                       │
                          ▼                               │
              ┌─────────────────────┐                     │
              │ Dynamic Token Select│                     │
              │   (100-400 tokens)  │                     │
              └──────────┬──────────┘                     │
                         ▼                                │
              Claude Sonnet Streaming                     │
                         │                                │
                         ▼                                │
              Sentence Buffer → ElevenLabs WS → Twilio    │
                         │                                │
                         ▼ (on call end)                  │
              Post-Call Analysis (Gemini Flash)           │
              - Summary, alerts, engagement metrics       │
                                                          │
                    └─────────────────────────────────────┘
```

## Conversation Director

The Director proactively guides each call:

| Feature | Description |
|---------|-------------|
| **Call Phase Tracking** | opening → rapport → main → closing |
| **Topic Management** | When to stay, transition, or wrap up |
| **Reminder Delivery** | Natural moments to deliver reminders |
| **Engagement Monitoring** | Detect low engagement, suggest re-engagement |
| **Emotional Detection** | Adjust tone for sad/concerned seniors |
| **Token Recommendations** | 100-400 tokens based on context |

## Dynamic Token Selection

| Situation | Tokens | Trigger |
|-----------|--------|---------|
| Normal conversation | 100 | Default |
| Health mention | 150 | Quick Observer |
| Emotional support | 200-250 | Director |
| Low engagement | 200 | Director |
| Reminder delivery | 150 | Director |
| Call closing | 150 | Director |

## Project Structure

```
donna/
├── index.js                    # Express server, routes, WebSocket handlers
├── pipelines/
│   ├── v1-advanced.js          # Main pipeline: STT→Observers→Claude→TTS
│   ├── quick-observer.js       # Layer 1: 730+ lines of regex patterns
│   └── fast-observer.js        # Layer 2: Conversation Director (Gemini)
├── adapters/
│   ├── llm/
│   │   ├── index.js            # Multi-provider factory (Claude, Gemini)
│   │   ├── claude.js           # Claude adapter with streaming
│   │   └── gemini.js           # Gemini adapter for Director
│   ├── elevenlabs.js           # REST TTS (fallback/greetings)
│   └── elevenlabs-streaming.js # WebSocket TTS (~150ms)
├── services/
│   ├── call-analysis.js        # Post-call: summary, concerns, score
│   ├── memory.js               # Semantic search, decay, deduplication
│   ├── seniors.js              # Senior CRUD, phone normalization
│   ├── conversations.js        # Call records, transcripts
│   ├── scheduler.js            # Reminder scheduling + prefetch
│   └── news.js                 # OpenAI web search, 1hr cache
├── db/
│   ├── client.js               # Database connection
│   └── schema.js               # Drizzle ORM schema
├── providers/
│   ├── index.js                # Provider factory (swappable abstractions)
│   ├── voice-provider.js       # Voice provider interface
│   └── memory-provider.js      # Memory provider interface
├── packages/
│   ├── logger/                 # TypeScript logging package
│   └── event-bus/              # TypeScript event bus package
├── public/                     # Legacy static files (fallback)
│   └── admin.html              # Legacy admin UI
├── apps/
│   ├── admin/                  # React admin dashboard (primary)
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
ANTHROPIC_API_KEY=...           # Claude Sonnet (voice)
GOOGLE_API_KEY=...              # Gemini Flash (Director + Analysis)
ELEVENLABS_API_KEY=...          # TTS
DEEPGRAM_API_KEY=...            # STT

# Optional
V1_STREAMING_ENABLED=true       # Set to 'false' to disable streaming
VOICE_MODEL=claude-sonnet       # Main voice model
FAST_OBSERVER_MODEL=gemini-3-flash  # Director model
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

```bash
# Deploy manually (recommended - webhook unreliable)
git push && git push origin main:master && railway up

# Or use alias after committing
git pushall && railway up
```

See [docs/guides/DEPLOYMENT_PLAN.md](./docs/guides/DEPLOYMENT_PLAN.md) for full setup.

## Documentation

- [docs/architecture/OVERVIEW.md](./docs/architecture/OVERVIEW.md) - System architecture
- [docs/CONVERSATION_DIRECTOR_SPEC.md](./docs/CONVERSATION_DIRECTOR_SPEC.md) - Director specification
- [docs/NEXT_STEPS.md](./docs/NEXT_STEPS.md) - Roadmap
- [CLAUDE.md](./CLAUDE.md) - AI assistant context

## License

Private - All rights reserved
