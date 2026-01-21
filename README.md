# Donna - AI Senior Companion

AI-powered companion that provides elderly individuals with friendly phone conversations via real-time voice AI.

## Features

- **Conversation Director Architecture** - Proactive call guidance
  - Layer 1: Quick Observer (0ms) - Instant regex patterns
  - Layer 2: Conversation Director (~150ms) - Gemini 3 Flash for call guidance
  - Layer 3: Post-Turn Agent - Background tasks after response
  - Post-Call Analysis - Async summary, concerns, engagement metrics
- **Dynamic Token Routing** - 100-400 tokens based on context
- **Streaming Pipeline** - ~600ms time-to-first-audio
  - Pre-generated greeting
  - Claude streaming responses
  - WebSocket TTS (ElevenLabs)
  - Sentence-by-sentence audio delivery
- Real-time voice calls (Twilio Media Streams)
- Speech transcription (Deepgram STT)
- Memory system with semantic search (pgvector)
- News updates (OpenAI web search)
- Scheduled reminder calls with delivery tracking
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
                         ▼                                │
              Layer 3: Post-Turn Agent (background)       │
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
├── index.js                    # Main server
├── pipelines/
│   ├── v1-advanced.js          # Main pipeline + call state tracking
│   ├── quick-observer.js       # Layer 1: Instant regex patterns
│   ├── fast-observer.js        # Layer 2: Conversation Director
│   ├── post-turn-agent.js      # Layer 3: Background tasks
│   └── observer-agent.js       # DEPRECATED
├── adapters/
│   ├── llm/index.js            # Multi-provider LLM adapter
│   ├── elevenlabs.js           # ElevenLabs REST TTS
│   └── elevenlabs-streaming.js # ElevenLabs WebSocket TTS
├── services/
│   ├── call-analysis.js        # Post-call batch analysis
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
- [docs/CONVERSATION_DIRECTOR_SPEC.md](./docs/CONVERSATION_DIRECTOR_SPEC.md) - Director specification
- [docs/NEXT_STEPS.md](./docs/NEXT_STEPS.md) - Roadmap
- [CLAUDE.md](./CLAUDE.md) - AI assistant context

## License

Private - All rights reserved
