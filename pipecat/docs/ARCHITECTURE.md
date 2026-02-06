# Donna Pipecat — Architecture Overview

> Python Pipecat port of Donna's voice pipeline, running in parallel with the existing Node.js stack.

## High-Level Architecture

```
                     ┌──────────────────────────────────────┐
                     │          Twilio Voice Call            │
                     └─────────────┬────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │     /voice/answer (TwiML)    │
                    │   Fetches senior context,     │
                    │   creates conversation,       │
                    │   returns <Stream url="/ws">  │
                    └──────────────┬───────────────┘
                                   │ WebSocket
                    ┌──────────────▼──────────────┐
                    │        main.py /ws            │
                    │   Accepts WS, creates         │
                    │   session_state, calls bot.py  │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │        Pipecat Pipeline       │
                    │        (see below)            │
                    └──────────────────────────────┘
```

## Pipecat Pipeline (bot.py)

```
Twilio Audio ──► FastAPIWebsocketTransport
                        │
                        ▼
                ┌───────────────┐
                │  Deepgram STT  │  (Speech-to-Text)
                └───────┬───────┘
                        │ TranscriptionFrame
                        ▼
              ┌─────────────────────┐
              │   Quick Observer     │  Layer 1: Instant regex (0ms)
              │   (252 patterns)     │  → health, goodbye, emotion,
              │                      │    cognitive, activity signals
              └─────────┬───────────┘
                        │ + AnalysisResult
                        ▼
              ┌─────────────────────┐
              │   Goodbye Gate       │  4s silence timer
              │                      │  Prevents premature ending
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Conversation Tracker │  Tracks topics, questions,
              │                      │  advice, stories per call
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │  Context Aggregator  │  Builds LLM context from
              │  (user side)         │  transcription frames
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │   Anthropic LLM      │  Claude Sonnet (streaming)
              │   + Flow Manager     │  Guided by Pipecat Flows
              └─────────┬───────────┘
                        │ TextFrame
                        ▼
              ┌─────────────────────┐
              │  Guidance Stripper   │  Removes [HEALTH]/[GOODBYE]
              │                      │  tags before TTS
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │  Context Aggregator  │  Tracks assistant responses
              │  (assistant side)    │  for conversation history
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │   ElevenLabs TTS     │  Text-to-Speech (streaming)
              └─────────┬───────────┘
                        │ AudioFrame
                        ▼
              FastAPIWebsocketTransport ──► Twilio Audio
```

## Pipecat Flows — Call Phase Management

```
┌──────────────┐     transition_to_main     ┌──────────────┐
│   Opening     │ ─────────────────────────► │    Main       │
│               │                            │               │
│ • Greeting    │                            │ • Conversation│
│ • Warm start  │                            │ • Reminders   │
│ • respond_    │                            │ • Memory tools│
│   immediately │                            │ • News search │
│               │                            │ • RESET_WITH_ │
│               │                            │   SUMMARY     │
└──────────────┘                            └───────┬───────┘
                                                     │
                                    transition_to_winding_down
                                                     │
                                                     ▼
                                            ┌──────────────┐
                                            │ Winding Down  │
                                            │               │
                                            │ • Last remind │
                                            │ • Summary     │
                                            └───────┬───────┘
                                                     │
                                        transition_to_closing
                                                     │
                                                     ▼
                                            ┌──────────────┐
                                            │   Closing     │
                                            │               │
                                            │ • Warm goodbye│
                                            │ • post_action:│
                                            │   end_convo   │
                                            │ • No tools    │
                                            └──────────────┘
```

### LLM Tools Available Per Phase

| Phase | Tools |
|-------|-------|
| **Opening** | `transition_to_main` |
| **Main** | `search_memories`, `get_news`, `save_important_detail`, `mark_reminder_acknowledged`, `transition_to_winding_down` |
| **Winding Down** | `mark_reminder_acknowledged`, `transition_to_closing` |
| **Closing** | *(none — post_action ends call)* |

## Directory Structure

```
pipecat/
├── main.py                          ← FastAPI entry point, /health, /ws
├── bot.py                           ← Pipeline assembly + run_bot()
│
├── api/
│   ├── routes/
│   │   ├── voice.py                 ← /voice/answer (TwiML), /voice/status
│   │   └── calls.py                 ← /api/call, /api/calls, /api/calls/:sid/end
│   ├── middleware/
│   │   ├── auth.py                  ← JWT admin auth
│   │   ├── api_auth.py              ← API key auth (DONNA_API_KEY)
│   │   ├── rate_limit.py            ← Rate limiting (slowapi)
│   │   ├── security.py              ← Security headers (HSTS, X-Frame-Options)
│   │   ├── twilio.py                ← Twilio webhook signature validation
│   │   └── error_handler.py         ← Global error handlers
│   └── validators/
│       └── schemas.py               ← Pydantic input validation
│
├── flows/
│   ├── nodes.py                     ← 4 call phase NodeConfigs + system prompt
│   └── tools.py                     ← LLM tool schemas + async handlers
│
├── processors/
│   ├── quick_observer.py            ← Layer 1: 252 regex patterns (0ms)
│   ├── goodbye_gate.py              ← 4s silence timer for call ending
│   ├── conversation_tracker.py      ← In-call topic/question/advice tracking
│   └── guidance_stripper.py         ← Strips [TAG] guidance from LLM output
│
├── services/
│   ├── greetings.py                 ← 24 time-based greeting templates
│   ├── daily_context.py             ← Cross-call same-day memory
│   ├── call_analysis.py             ← Post-call analysis (JSON repair, formatting)
│   ├── memory.py                    ← Semantic memory (pgvector)
│   ├── conversations.py             ← Conversation CRUD
│   ├── seniors.py                   ← Senior profile lookup
│   ├── caregivers.py                ← Caregiver-senior relationships
│   ├── scheduler.py                 ← Reminder scheduling
│   ├── context_cache.py             ← Pre-cache senior context (5 AM local)
│   └── news.py                      ← News via OpenAI web search
│
├── db/
│   └── client.py                    ← asyncpg pool + query helpers
│
├── lib/
│   └── sanitize.py                  ← PII-safe logging (phone, name masking)
│
└── tests/                           ← 13 test files, 163+ tests
    ├── test_quick_observer.py       ← Regex pattern matching
    ├── test_conversation_tracker.py ← Topic/question extraction
    ├── test_goodbye_gate.py         ← Silence timer & callbacks
    ├── test_nodes.py                ← Flow node definitions
    ├── test_tools.py                ← LLM tool schemas & handlers
    ├── test_api_routes.py           ← Health, voice, auth endpoints
    ├── test_call_analysis.py        ← JSON repair, transcript formatting
    ├── test_daily_context.py        ← Context formatting & timezone
    ├── test_greetings.py            ← Greeting templates & rotation
    ├── test_validators.py           ← Pydantic schema validation
    ├── test_sanitize.py             ← PII masking
    ├── test_guidance_stripper.py    ← Tag stripping
    └── test_db.py                   ← DB client (integration, skipped locally)
```

## Parallel Deployment (Node.js + Pipecat)

```
┌─────────────────────────────────┐    ┌──────────────────────────────────┐
│    Node.js (existing)            │    │    Pipecat (new)                  │
│    Railway — PORT 3001           │    │    Railway — PORT 7860            │
│                                  │    │                                   │
│  • Custom streaming pipeline     │    │  • Pipecat FrameProcessor pipeline│
│  • v1-advanced.js                │    │  • Pipecat Flows (4 phases)       │
│  • Quick Observer (JS)           │    │  • Quick Observer (Python, same   │
│  • Conversation Director (L2)    │    │    252 patterns)                  │
│  • ElevenLabs WS TTS             │    │  • ElevenLabs TTS (Pipecat)       │
│  • Deepgram STT                  │    │  • Deepgram STT (Pipecat)         │
│  • Express + WS                  │    │  • FastAPI + WebSocket            │
│  • SCHEDULER_ENABLED=true        │    │  • SCHEDULER_ENABLED=false        │
│                                  │    │                                   │
│  Twilio phone → this service     │    │  Twilio phone → this service      │
│  Admin v2 → this API             │    │  (separate Twilio number or       │
│                                  │    │   switched after validation)      │
└─────────────────────────────────┘    └──────────────────────────────────┘
                │                                       │
                └───────────┬───────────────────────────┘
                            │
                ┌───────────▼───────────┐
                │   Shared Resources     │
                │                        │
                │  • Neon PostgreSQL DB   │
                │  • Same DB schema       │
                │  • Same API keys        │
                │  • Same JWT_SECRET      │
                │  • Same DONNA_API_KEY   │
                └────────────────────────┘
```

### Key Differences from Node.js Stack

| Aspect | Node.js | Pipecat |
|--------|---------|---------|
| **Pipeline** | Custom streaming (v1-advanced.js) | Pipecat FrameProcessor pipeline |
| **Call phases** | Conversation Director (Gemini Flash L2) | Pipecat Flows (4 NodeConfigs) |
| **Transport** | Raw Twilio WebSocket | FastAPIWebsocketTransport + TwilioFrameSerializer |
| **LLM** | Claude Sonnet (streaming, sentence-by-sentence) | AnthropicLLMService (Pipecat managed) |
| **TTS** | ElevenLabs WebSocket (custom) | ElevenLabs via Pipecat |
| **STT** | Deepgram (custom integration) | DeepgramSTTService (Pipecat managed) |
| **Token routing** | Dynamic (100-400, Quick Observer driven) | Flow-node-based with model_recommendation |
| **Goodbye** | Custom timer in v1-advanced.js | GoodbyeGateProcessor (FrameProcessor) |
| **Scheduler** | Active (SCHEDULER_ENABLED=true) | Disabled (prevents dual-scheduler) |

## Database Schema (shared)

9 tables, same schema as Node.js:

| Table | Purpose |
|-------|---------|
| `seniors` | Senior profiles (name, phone, interests, timezone) |
| `conversations` | Call records (duration, metrics) |
| `memories` | Semantic memories (pgvector embeddings) |
| `reminders` | Scheduled reminders |
| `reminder_deliveries` | Delivery tracking per call |
| `caregivers` | Caregiver-senior relationships |
| `call_analyses` | Post-call AI analysis |
| `daily_call_context` | Cross-call same-day memory |
| `admin_users` | Admin dashboard accounts (bcrypt) |

## Environment Variables

```bash
# Server
PORT=7860                        # Different from Node.js (3001)

# Twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# Database (shared with Node.js)
DATABASE_URL=...

# AI Services
ANTHROPIC_API_KEY=...            # Claude Sonnet (voice LLM)
DEEPGRAM_API_KEY=...             # STT
ELEVENLABS_API_KEY=...           # TTS
OPENAI_API_KEY=...               # Embeddings + news search

# Auth (shared with Node.js)
JWT_SECRET=...
DONNA_API_KEY=...

# Scheduler (MUST be false to prevent conflicts)
SCHEDULER_ENABLED=false

# Testing
RUN_DB_TESTS=1                   # Set to run DB integration tests
```

---

*Last updated: February 2026 — Pipecat migration v0.1*
