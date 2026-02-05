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
- In-call memory tracking (topics, questions, advice, stories)
- Same-day cross-call memory (timezone-aware daily context)
- Enhanced web search (factual/curiosity questions + news)
- News updates (OpenAI web search)
- Scheduled reminder calls with delivery tracking
- Admin dashboard v2 (React + Vite + Tailwind, Vercel) - 7 pages: Dashboard, Seniors, Calls, Reminders, Call Analyses, Caregivers, Daily Context
- Consumer app (caregiver onboarding + dashboard)
- Observability dashboard (React)

### Security
- Authentication (Clerk for consumer, JWT for admin dashboard)
- Input validation (Zod schemas)
- Rate limiting (express-rate-limit)
- Twilio webhook signature verification

## Quick Start

```bash
npm install
npm run dev
```

Test health:
```bash
curl http://localhost:3001/health
```

Admin dashboard: `http://localhost:5175` (run `npm run dev` in `apps/admin-v2/`)
Consumer app: `http://localhost:5173` (run `npm run dev` in `apps/consumer/`)
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
│   │   ├── gemini.js           # Gemini adapter for Director
│   │   └── base.js             # Base LLM interface
│   ├── elevenlabs.js           # REST TTS (fallback/greetings)
│   └── elevenlabs-streaming.js # WebSocket TTS (~150ms)
├── services/
│   ├── call-analysis.js        # Post-call: summary, concerns, score
│   ├── caregivers.js           # Caregiver-senior relationship management
│   ├── context-cache.js        # Pre-cache senior context (5 AM)
│   ├── daily-context.js        # Same-day cross-call memory service
│   ├── memory.js               # Semantic search, decay, deduplication
│   ├── seniors.js              # Senior CRUD, phone normalization
│   ├── conversations.js        # Call records, transcripts
│   ├── scheduler.js            # Reminder scheduling + prefetch
│   └── news.js                 # OpenAI web search, 1hr cache
├── middleware/
│   ├── auth.js                 # Clerk authentication
│   ├── clerk.js                # Clerk middleware init
│   ├── rate-limit.js           # Rate limiting
│   ├── twilio.js               # Webhook signature verification
│   └── validate.js             # Zod validation middleware
├── validators/
│   └── schemas.js              # Zod schemas for all API inputs
├── db/
│   ├── client.js               # Database connection (Neon + Drizzle)
│   ├── schema.js               # Drizzle ORM schema (8 tables)
│   └── setup-pgvector.js       # pgvector initialization
├── packages/
│   ├── logger/                 # TypeScript logging package
│   └── event-bus/              # TypeScript event bus package
├── apps/
│   ├── admin/                  # Legacy admin dashboard (React + Vite)
│   ├── admin-v2/               # Admin dashboard v2 (React + Vite + Tailwind, Vercel)
│   │   ├── src/components/     # Layout, Modal, Toast
│   │   ├── src/pages/          # Dashboard, Seniors, Calls, Reminders, etc.
│   │   └── src/lib/            # API client, auth context, utils
│   ├── consumer/               # Caregiver onboarding + dashboard (Vercel)
│   ├── observability/          # React observability dashboard
│   └── web/                    # Future placeholder
├── public/                     # Legacy static files (fallback)
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
| `/api/reminders` | GET/POST/PATCH/DELETE | Manage reminders |
| `/api/onboarding` | POST | Consumer app onboarding |
| `/api/caregivers` | GET/POST | Caregiver management |
| `/api/admin/login` | POST | Admin JWT login |
| `/api/admin/me` | GET | Verify admin token |
| `/api/call-analyses` | GET | Post-call analysis data |
| `/api/daily-context` | GET | Cross-call daily context |
| `/api/observability/*` | GET | Observability data |

## Deployment

**API Server (Railway):**

```bash
# Deploy manually (recommended - webhook unreliable)
git push && git push origin main:master && railway up

# Or use alias after committing
git pushall && railway up
```

**Admin Dashboard v2 (Vercel):**
```bash
cd apps/admin-v2 && npx vercel --prod --yes
```
- Live: https://admin-v2-liart.vercel.app

**Consumer App (Vercel):**
- Auto-deploys from `apps/consumer/` on push
- Build command: `cd apps/consumer && npm install && npm run build`

See [docs/guides/DEPLOYMENT_PLAN.md](./docs/guides/DEPLOYMENT_PLAN.md) for full setup.

## Documentation

- [docs/architecture/OVERVIEW.md](./docs/architecture/OVERVIEW.md) - System architecture
- [docs/PRODUCT_PLAN.md](./docs/PRODUCT_PLAN.md) - Product plan and feature log
- [docs/CONVERSATION_DIRECTOR_SPEC.md](./docs/CONVERSATION_DIRECTOR_SPEC.md) - Director specification
- [docs/NEXT_STEPS.md](./docs/NEXT_STEPS.md) - Roadmap
- [docs/todos/_dashboard.md](./docs/todos/_dashboard.md) - Task tracking dashboard
- [CLAUDE.md](./CLAUDE.md) - AI assistant context

## License

Private - All rights reserved
