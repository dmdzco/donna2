# Donna - AI Senior Companion

AI-powered companion that provides elderly individuals with friendly phone conversations via real-time voice AI.

## Features

### Voice Pipeline (Pipecat)
- **2-Layer Conversation Director Architecture**
  - Layer 1: Quick Observer (0ms) - 268 regex patterns for health, emotion, safety, goodbye
  - Layer 2: Conversation Director (~150ms) - Gemini 3 Flash for non-blocking call guidance
  - Post-Call Analysis - Summary, concerns, engagement score (Gemini Flash)
- **Pipecat Flows** - 4-phase call state machine (opening → main → winding_down → closing)
- **Programmatic Call Ending** - Goodbye detection → EndFrame after 3.5s (bypasses unreliable LLM tool calls)
- **Director Fallback Actions** - Force winding-down at 9min, force call end at 12min
- **Barge-in support** - Interrupt detection via Silero VAD

### Core Capabilities
- Real-time voice calls (Twilio Media Streams → Pipecat WebSocket)
- Speech transcription (Deepgram Nova 3)
- LLM responses (Claude Sonnet 4.5 via Pipecat AnthropicLLMService)
- Text-to-speech (ElevenLabs via Pipecat)
- Semantic memory with decay + deduplication (pgvector)
- Full in-call context retention (APPEND strategy, no summary truncation)
- Cross-call turn history (recent turns from previous calls in system prompt)
- In-call memory tracking (topics, questions, advice per call)
- Same-day cross-call memory (timezone-aware daily context + call summaries)
- News via OpenAI web search (1hr cache)
- Scheduled reminder calls with delivery tracking
- Context pre-caching at 5 AM local time
- 4 LLM tools: search_memories, get_news, save_important_detail, mark_reminder_acknowledged
- Admin dashboard v2 (React + Vite + Tailwind, Vercel)
- Consumer app (caregiver onboarding + dashboard)

### Security
- JWT admin authentication
- API key authentication (DONNA_API_KEY)
- Twilio webhook signature verification
- Rate limiting (slowapi)
- Security headers (HSTS, X-Frame-Options)
- Pydantic input validation

## Quick Start

### Railway-First Development

Voice and API features are developed directly against Railway — not localhost. Local servers can't meaningfully test Twilio calls, WebSocket audio streams, or real STT/TTS latency.

```bash
cd pipecat && railway up    # Deploy to Railway
```

Test health:
```bash
curl https://donna-pipecat-production.up.railway.app/health
```

**Voice features:** Deploy to Railway, test with a real phone call. This is the only test that matters.

**Unit tests** (pure logic, no external services):
```bash
cd pipecat && python -m pytest tests/
```

**Frontend apps** (run locally against the Railway API):
- Admin dashboard: `http://localhost:5175` (run `npm run dev` in `apps/admin-v2/`)
- Consumer app: `http://localhost:5173` (run `npm run dev` in `apps/consumer/`)
- Observability: `http://localhost:5174` (run `npm run dev` in `apps/observability/`)

## Architecture

### Pipecat Voice Pipeline (bot.py)

Each box is a Pipecat `FrameProcessor` in a linear `Pipeline`. Frames flow top-to-bottom.

```
Phone Call → Twilio Media Streams → WebSocket
                      │
               ┌──────▼──────────────┐
               │  Deepgram STT        │  Speech → TranscriptionFrame
               │  (Nova 3, 8kHz)      │  interim results + smart format
               └──────┬──────────────┘
                      │ TranscriptionFrame
               ┌──────▼──────────────┐
               │  Quick Observer      │  Layer 1 (0ms): 268 regex patterns
               │                      │  Injects [HEALTH]/[SAFETY]/etc. guidance
               │                      │  via LLMMessagesAppendFrame
               │                      │  Strong goodbye → EndFrame in 3.5s
               └──────┬──────────────┘
                      │
               ┌──────▼──────────────┐
               │  Conversation        │  Layer 2 (~150ms): Gemini 3 Flash
               │  Director            │  NON-BLOCKING (asyncio.create_task)
               │                      │  Injects PREVIOUS turn's guidance
               │                      │  Force winding-down at 9min
               │                      │  Force call end at 12min
               └──────┬──────────────┘
                      │
               ┌──────▼──────────────┐
               │  Context Aggregator  │  Pairs user transcriptions with
               │  (user side)         │  assistant responses for LLM context
               └──────┬──────────────┘
                      │
               ┌──────▼──────────────┐
               │  Claude Sonnet 4.5   │  Streaming LLM responses
               │  + FlowManager       │  4-phase call state machine
               │  + 4 LLM tools       │  (opening → main → winding → closing)
               └──────┬──────────────┘
                      │ TextFrame
               ┌──────▼──────────────┐
               │  Conversation        │  Tracks topics, questions, advice
               │  Tracker             │  Maintains shared transcript
               └──────┬──────────────┘
                      │
               ┌──────▼──────────────┐
               │  Guidance Stripper   │  Strips <guidance> tags and
               │                      │  [BRACKETED] directives before TTS
               └──────┬──────────────┘
                      │
               ┌──────▼──────────────┐
               │  ElevenLabs TTS      │  Text → AudioFrame (streaming)
               └──────┬──────────────┘
                      │
               ┌──────▼──────────────┐
               │  Twilio Transport    │  AudioFrame → mulaw 8kHz → phone
               │  (output)            │
               └──────┬──────────────┘
                      │
               ┌──────▼──────────────┐
               │  Context Aggregator  │  Tracks assistant responses
               │  (assistant side)    │  for conversation history
               └──────────────────────┘

                      ▼ (on disconnect)
               Post-Call: Analysis → Memory Extraction → Daily Context
```

## Conversation Director

The Director runs non-blocking per turn via `asyncio.create_task()`:

| Feature | Description |
|---------|-------------|
| **Call Phase Tracking** | opening → main → winding_down → closing |
| **Topic Management** | When to stay, transition, or wrap up |
| **Reminder Delivery** | Natural moments to deliver reminders |
| **Engagement Monitoring** | Detect low engagement, suggest re-engagement |
| **Emotional Detection** | Adjust tone for sad/concerned seniors |
| **Goodbye Suppression** | Skips guidance when Quick Observer detects goodbye |
| **Time-Based Fallbacks** | Force winding-down at 9min, force end at 12min |

## Architecture Decision: Two Backends

Donna runs two backend services by design — each owns a clear responsibility:

- **Pipecat (Python, Railway:7860)** — Real-time voice pipeline (STT, Observer, Director, Claude, TTS)
- **Node.js (Express, Railway:3001)** — REST APIs for frontends, reminder scheduler, call initiation

Both share the same Neon PostgreSQL database.

## Project Structure

```
pipecat/                                # Voice pipeline (Python, Railway port 7860)
├── main.py                             # FastAPI entry point, /health, /ws
├── bot.py                              # Pipeline assembly + run_bot()
├── config.py                           # All env vars centralized
├── prompts.py                          # System prompts + phase instructions
├── flows/
│   ├── nodes.py                        # 4 call phase NodeConfigs
│   └── tools.py                        # 4 LLM tool schemas + async handlers
├── processors/
│   ├── patterns.py                     # 268 regex patterns, 19 categories
│   ├── quick_observer.py               # Layer 1: analysis + goodbye EndFrame
│   ├── conversation_director.py        # Layer 2: Gemini Flash non-blocking
│   ├── conversation_tracker.py         # Topic/question/advice tracking
│   ├── metrics_logger.py              # Call metrics logging
│   ├── goodbye_gate.py                 # False-goodbye grace period (not in active pipeline)
│   └── guidance_stripper.py            # Strip <guidance> tags before TTS
├── services/
│   ├── post_call.py                    # Post-call orchestration
│   ├── call_analysis.py                # Post-call analysis (Gemini Flash)
│   ├── director_llm.py                 # Gemini Flash analysis for Director
│   ├── memory.py                       # Semantic memory (pgvector, decay)
│   ├── scheduler.py                    # Reminder scheduling + outbound calls
│   ├── reminder_delivery.py            # Delivery CRUD + prompt formatting
│   ├── context_cache.py                # Pre-cache at 5 AM local
│   ├── conversations.py                # Conversation CRUD
│   ├── daily_context.py                # Cross-call same-day memory
│   ├── greetings.py                    # Greeting templates + rotation
│   ├── interest_discovery.py           # Interest extraction from conversations
│   ├── seniors.py, caregivers.py       # Profile CRUD
│   └── news.py                         # OpenAI web search (1hr cache)
├── api/
│   ├── routes/                         # voice.py, calls.py
│   └── middleware/                      # auth, rate_limit, security, twilio
├── db/client.py                        # asyncpg pool + query helpers
├── tests/                              # 36 test files + helpers/mocks/scenarios
├── pyproject.toml                      # Python 3.12, Pipecat v0.0.101+
└── Dockerfile                          # python:3.12-slim + uv

/                                       # Node.js admin API (Express, Railway port 3001)
├── index.js                            # Express server entry
├── routes/                             # 16 route modules (all /api/* endpoints)
├── services/                           # 9 service files (DB access for admin APIs)
├── middleware/                          # auth, rate-limit, security, twilio
└── db/                                 # Drizzle ORM schema + client

apps/                                   # Frontend apps (Vercel)
├── admin-v2/                           # Admin dashboard (React + Vite + Tailwind)
├── consumer/                           # Caregiver onboarding + dashboard
└── observability/                      # Call monitoring dashboard
```

## Environment Variables

```bash
# Server
PORT=7860

# Twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# Database
DATABASE_URL=postgresql://...           # Neon PostgreSQL + pgvector

# AI Services
ANTHROPIC_API_KEY=...                   # Claude Sonnet 4.5 (voice LLM)
GOOGLE_API_KEY=...                      # Gemini Flash (Director + Analysis)
DEEPGRAM_API_KEY=...                    # STT
ELEVENLABS_API_KEY=...                  # TTS
OPENAI_API_KEY=...                      # Embeddings + news search

# Auth
JWT_SECRET=...                          # Admin JWT signing
DONNA_API_KEY=...                       # API key auth

# Scheduler
SCHEDULER_ENABLED=false                 # Must be false (Node.js runs scheduler)

# Optional
FAST_OBSERVER_MODEL=gemini-3-flash-preview  # Director model
ELEVENLABS_VOICE_ID=...                 # Voice ID (has default)
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with active call count |
| `/voice/answer` | POST | Twilio webhook (returns TwiML with `<Stream>`) |
| `/voice/status` | POST | Call status updates |
| `/api/call` | POST | Initiate outbound call |
| `/api/calls` | GET | List recent calls |
| `/api/calls/:sid/end` | POST | Force-end a call |

## Deployment

**Pipecat voice pipeline (Railway):**
```bash
cd pipecat && railway up
```

> **Do NOT test voice/call features locally.** Deploy to Railway and test with real Twilio phone calls.

**Admin Dashboard v2 (Vercel):**
```bash
cd apps/admin-v2 && npx vercel --prod --yes
```
- Live: https://admin-v2-liart.vercel.app

## Documentation

- [pipecat/docs/ARCHITECTURE.md](./pipecat/docs/ARCHITECTURE.md) - Pipecat pipeline architecture
- [docs/architecture/OVERVIEW.md](./docs/architecture/OVERVIEW.md) - System architecture overview
- [docs/PRODUCT_PLAN.md](./docs/PRODUCT_PLAN.md) - Product plan and feature log
- [claude.md](./claude.md) - AI assistant context

## License

Private - All rights reserved
