# Donna Project - AI Context

> **AI Assistants**: You have permission to update this file as the project evolves. Keep it accurate and current.

## MANDATORY: Read Before Coding

**Before writing or modifying any code, read [`DIRECTORY.md`](DIRECTORY.md).** It tells you:
- What each directory does and whether it's active or legacy
- Which backend (Pipecat Python vs Node.js Express) owns which functionality
- Exactly which file to open for any given task
- Which files are large and should only be loaded when necessary

Do NOT confuse the Node.js `services/` with `pipecat/services/` — they are separate implementations sharing the same database.

---

## Project Goal

**Donna** is an AI-powered companion that makes friendly phone calls to elderly individuals, providing:
- **Daily check-ins** - Warm, conversational calls to combat loneliness
- **Medication reminders** - Gentle, natural reminders woven into conversation
- **Companionship** - Discussing interests, sharing news, being a friendly presence
- **Caregiver peace of mind** - Summaries and alerts for family members

**Target Users**:
- **Seniors** (70+) who live alone or have limited social contact
- **Caregivers** (adult children, family) who want to ensure their loved ones are okay

---

## Current Status: v4.0

The voice pipeline runs on **Python Pipecat** (`pipecat/` directory). Node.js (repo root) serves admin/consumer APIs and the reminder scheduler. See "Architecture Decision: Two Backends" below.

### Working Features (Pipecat)
- **2-Layer Observer Architecture + Post-Call**
  - Layer 1: Quick Observer (0ms) - 268 regex patterns + programmatic goodbye (3.5s EndFrame)
  - Layer 2: Conversation Director (~150ms) - Non-blocking Gemini Flash per-turn analysis
  - Post-Call: Analysis, memory extraction, daily context (Gemini Flash)
- **Pipecat Flows** - 4-phase call state machine (opening → main → winding_down → closing)
- **4 LLM Tools** - search_memories, get_news, save_important_detail, mark_reminder_acknowledged
- **Programmatic Call Ending** - Quick Observer detects goodbye → EndFrame after 3.5s (bypasses LLM)
- **Director Fallback Actions** - Force winding-down at 9min, force end at 12min
- **Full In-Call Context Retention** - APPEND strategy keeps complete conversation history (no summary truncation)
- **Cross-Call Turn History** - Recent turns from previous calls loaded into system prompt via `get_recent_turns()`
- **In-Call Memory Tracking** - Topics, questions, advice tracked per call (ConversationTracker)
- **Same-Day Cross-Call Memory** - Daily context + call summaries persist across calls per senior per day
- **Greeting Rotation** - Time-based templates with interest/context followups
- **Semantic Memory** - pgvector with decay + deduplication + tiered retrieval
- **Scheduled Reminder Calls** - Polling scheduler with prefetch + delivery tracking
- **Context Pre-caching** - Senior context cached at 5 AM local time
- Real-time voice calls (Twilio Media Streams → Pipecat WebSocket)
- Speech transcription (Deepgram Nova 3 via Pipecat)
- LLM responses (Claude Sonnet 4.5 via Pipecat AnthropicLLMService)
- TTS (ElevenLabs via Pipecat)
- VAD (Silero — confidence=0.6, stop_secs=1.2, min_volume=0.5)
- News via OpenAI web search (1hr cache)
- Security: JWT admin auth, API key auth, Twilio webhook validation, rate limiting, security headers

### Frontend Apps (unchanged, on Vercel/separate)
- **Admin Dashboard (v2)** - React + Vite + Tailwind (`apps/admin-v2/`) on Vercel
- **Consumer App** - React + Vite + Clerk (`apps/consumer/`) on Vercel
- **Observability Dashboard** - React (`apps/observability/`)

---

## Architecture

**Full documentation**: [pipecat/docs/ARCHITECTURE.md](pipecat/docs/ARCHITECTURE.md)

### Pipecat Pipeline (bot.py)

Linear pipeline — each processor is a Pipecat `FrameProcessor`. Frames flow top to bottom.

```
Twilio Audio ──► FastAPIWebsocketTransport
                        │
                   Deepgram STT (Nova 3, 8kHz)
                        │ TranscriptionFrame
                        ▼
              ┌─────────────────────┐
              │   Quick Observer     │  Layer 1 (0ms): 268 regex patterns
              │                      │  Injects guidance via LLMMessagesAppendFrame
              │                      │  Strong goodbye → EndFrame in 3.5s
              └─────────┬───────────┘
                        ▼
              ┌─────────────────────┐
              │ Conversation         │  Layer 2 (~150ms): Gemini 3 Flash Preview
              │ Director             │  NON-BLOCKING (asyncio.create_task)
              │                      │  Injects PREVIOUS turn's cached guidance
              │                      │  Force winding-down at 9min, end at 12min
              └─────────┬───────────┘
                        ▼
              Context Aggregator (user) ← builds LLM context from transcriptions
                        ▼
              Claude Sonnet 4.5 + FlowManager (4-phase state machine)
                        │ TextFrame
                        ▼
              Conversation Tracker (topics, questions, advice + shared transcript)
                        ▼
              Guidance Stripper (strips <guidance> tags + [BRACKETED] directives)
                        ▼
              ElevenLabs TTS (eleven_turbo_v2_5)
                        ▼
              FastAPIWebsocketTransport ──► Twilio Audio (mulaw 8kHz)
                        ▼
              Context Aggregator (assistant) ← tracks assistant responses
```

**Key mechanism**: Both Quick Observer and Director inject guidance into Claude's context via `LLMMessagesAppendFrame(run_llm=False)`. The guidance appears as user-role messages in Claude's context before the next LLM call is triggered by the Context Aggregator.

### Call Phase State Machine (Pipecat Flows)

| Phase | Tools | Context Strategy |
|-------|-------|-----------------|
| **Opening** | search_memories, save_important_detail, transition_to_main | APPEND, respond_immediately |
| **Main** | search_memories, get_news, save_important_detail, mark_reminder_acknowledged, transition_to_winding_down | APPEND |
| **Winding Down** | mark_reminder_acknowledged, save_important_detail, transition_to_closing | APPEND |
| **Closing** | *(none — post_action: end_conversation)* | APPEND |

### Post-Call Processing

On disconnect: complete conversation → call analysis (Gemini) → summary persistence → memory extraction (OpenAI) → daily context save → reminder cleanup → cache clear.

---

## Key Files (Pipecat)

```
pipecat/
├── main.py                          ← FastAPI entry point, /health, /ws, middleware
├── bot.py                           ← Pipeline assembly + run_bot() (297 LOC)
├── config.py                        ← All env vars centralized (110 LOC)
├── prompts.py                       ← System prompts + phase task instructions (105 LOC)
│
├── flows/
│   ├── nodes.py                     ← 4 call phase NodeConfigs (imports prompts.py) (317 LOC)
│   └── tools.py                     ← 4 LLM tool schemas + closure-based handlers (236 LOC)
│
├── processors/
│   ├── patterns.py                  ← Pattern data: 268 regex patterns, 19 categories (503 LOC)
│   ├── quick_observer.py            ← Layer 1: analysis logic + goodbye EndFrame (386 LOC)
│   ├── conversation_director.py     ← Layer 2: Gemini 3 Flash Preview non-blocking (183 LOC)
│   ├── conversation_tracker.py      ← Topic/question/advice tracking + transcript (246 LOC)
│   ├── metrics_logger.py            ← Call metrics logging processor (97 LOC)
│   ├── goodbye_gate.py              ← False-goodbye grace period — NOT in active pipeline (135 LOC)
│   └── guidance_stripper.py         ← Strip <guidance> tags + [BRACKETED] directives (115 LOC)
│
├── services/
│   ├── scheduler.py                 ← Reminder polling + outbound calls (427 LOC)
│   ├── reminder_delivery.py         ← Delivery CRUD + prompt formatting (95 LOC)
│   ├── post_call.py                 ← Post-call: analysis, memory, cleanup (169 LOC)
│   ├── director_llm.py              ← Gemini Flash analysis for Director (340 LOC)
│   ├── call_analysis.py             ← Post-call analysis (Gemini Flash) (226 LOC)
│   ├── memory.py                    ← Semantic memory (pgvector, decay) (355 LOC)
│   ├── interest_discovery.py        ← Interest extraction from conversations (183 LOC)
│   ├── context_cache.py             ← Pre-cache at 5 AM local (290 LOC)
│   ├── conversations.py             ← Conversation CRUD (250 LOC)
│   ├── daily_context.py             ← Cross-call same-day memory (161 LOC)
│   ├── greetings.py                 ← Greeting templates + rotation (300 LOC)
│   ├── seniors.py                   ← Senior profile CRUD (105 LOC)
│   ├── caregivers.py                ← Caregiver relationships (78 LOC)
│   └── news.py                      ← OpenAI web search (202 LOC)
│
├── api/
│   ├── routes/
│   │   ├── voice.py                 ← /voice/answer (TwiML), /voice/status
│   │   └── calls.py                 ← /api/call, /api/calls
│   ├── middleware/                   ← auth, api_auth, rate_limit, security, twilio, error_handler
│   └── validators/schemas.py        ← Pydantic input validation
│
├── db/client.py                     ← asyncpg pool + query helpers
├── lib/sanitize.py                  ← PII-safe logging
├── tests/                           ← 36 test files + helpers/mocks/scenarios
├── pyproject.toml                   ← Python 3.12, Pipecat v0.0.101+
└── Dockerfile                       ← python:3.12-slim + uv
```

### Node.js Admin API (repo root)

```
/
├── index.js                    ← Express server (port 3001, admin/consumer APIs)
├── services/                   ← 9 service files (dual implementation with pipecat/services/)
├── routes/                     ← 16 route modules (all /api/* endpoints)
├── middleware/                  ← 7 middleware files (auth, rate-limit, security)
└── apps/                       ← Frontend apps (still active)
    ├── admin-v2/               ← Admin dashboard (Vercel)
    ├── consumer/               ← Consumer app (Vercel)
    └── observability/          ← Observability dashboard
```

---

## Development Philosophy

### Railway-First Development

**All development targets Railway (production) from the start.** Do NOT build features locally with ngrok or local server testing for voice/call features.

- **Voice/call features:** Deploy to Railway, test with real phone calls
- **Unit tests (pure logic):** Run locally — `cd pipecat && python -m pytest tests/`
- **Frontend apps:** Run locally against Railway API, or deploy to Vercel

**Workflow:** write code → commit → push → `cd pipecat && railway up` → test with real call

---

## For AI Assistants

### When Making Changes (Pipecat)

| Task | Where to Look |
|------|---------------|
| Change conversation behavior | `pipecat/prompts.py` (prompt text) + `pipecat/flows/nodes.py` (flow logic) |
| Add/modify LLM tools | `pipecat/flows/tools.py` (schemas + handlers) |
| Modify Quick Observer patterns | `pipecat/processors/patterns.py` (data) + `pipecat/processors/quick_observer.py` (logic) |
| Modify Conversation Director | `pipecat/processors/conversation_director.py` + `pipecat/services/director_llm.py` |
| Modify call ending behavior | `pipecat/processors/quick_observer.py` (goodbye EndFrame) + `pipecat/processors/conversation_director.py` (time-based) |
| Change pipeline assembly | `pipecat/bot.py` |
| Modify post-call processing | `pipecat/services/post_call.py` |
| Modify post-call analysis | `pipecat/services/call_analysis.py` |
| Modify memory system | `pipecat/services/memory.py` |
| Modify greeting templates | `pipecat/services/greetings.py` |
| Modify context pre-caching | `pipecat/services/context_cache.py` |
| Modify cross-call daily context | `pipecat/services/daily_context.py` |
| Modify reminder scheduling | `pipecat/services/scheduler.py` (polling) + `pipecat/services/reminder_delivery.py` (CRUD) |
| Check/add environment variables | `pipecat/config.py` |
| Modify in-call tracking | `pipecat/processors/conversation_tracker.py` |
| Modify guidance stripping | `pipecat/processors/guidance_stripper.py` |
| Add API routes | `pipecat/api/routes/` |
| Modify auth/middleware | `pipecat/api/middleware/` |
| Database queries | `pipecat/db/client.py` |
| Server setup | `pipecat/main.py` |
| Update admin UI (v2) | `apps/admin-v2/src/pages/` |
| Update admin API client | `apps/admin-v2/src/lib/api.ts` |

### Documentation Updates

After each commit that adds features or changes architecture, update:

1. **`DIRECTORY.md`** - Directory map and wayfinding (agents read this FIRST)
2. **`pipecat/docs/ARCHITECTURE.md`** - Pipeline diagrams, file structure, tech stack
3. **`CLAUDE.md`** (this file) - Working features, key files, AI assistant reference
4. **`README.md`** - Features, quick start, project structure
5. **`docs/architecture/OVERVIEW.md`** - High-level architecture overview

### Deployment

**Pipecat (Railway):**
```bash
cd pipecat && railway up
```

Railway project: `36e40dcb-ada1-4df5-9465-627d3cfdff71`
Service: `donna-pipecat` (port 7860)
URL: `https://donna-pipecat-production.up.railway.app`

**Node.js admin API (Railway):**
```bash
# From repo root
railway up
```

**Admin v2 (Vercel):**
```bash
cd apps/admin-v2 && npx vercel --prod --yes
```
Live: https://admin-v2-liart.vercel.app

### Environment Variables

```bash
# Server
PORT=7860

# Twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# Database
DATABASE_URL=...                 # Neon PostgreSQL

# AI Services
ANTHROPIC_API_KEY=...            # Claude Sonnet (voice LLM)
GOOGLE_API_KEY=...               # Gemini Flash (Director + Analysis)
DEEPGRAM_API_KEY=...             # STT
ELEVENLABS_API_KEY=...           # TTS
ELEVENLABS_VOICE_ID=...          # Voice ID (optional)
OPENAI_API_KEY=...               # Embeddings + news search

# Auth
JWT_SECRET=...
DONNA_API_KEY=...

# Scheduler
SCHEDULER_ENABLED=false          # MUST be false (Node.js runs scheduler)

# Monitoring
SENTRY_DSN=...                               # Error monitoring (optional, both backends)

# Optional
FAST_OBSERVER_MODEL=gemini-3-flash-preview   # Director model
CALL_ANALYSIS_MODEL=gemini-3-flash-preview   # Post-call analysis model
LOG_LEVEL=INFO                               # DEBUG for verbose pipecat logs
```

---

## Architecture Decision: Two Backends

Running separate Python (Pipecat) and Node.js (Express) backends is an **explicit decision**, not tech debt. Each backend owns a clear responsibility:
- **Pipecat (Python)** — Real-time voice pipeline (STT, Observer, Director, Claude, TTS)
- **Node.js (Express)** — REST APIs for frontends, reminder scheduler, call initiation

Both share the same Neon PostgreSQL database. Dual service implementations (e.g. `services/memory.js` and `pipecat/services/memory.py`) exist because each backend needs database access for its own purpose — they are not redundant.

## Roadmap

- ~~Streaming Pipeline~~ ✓ Completed
- ~~Dynamic Token Routing~~ ✓ Completed
- ~~Conversation Director~~ ✓ Completed (both Node.js and Pipecat)
- ~~Post-Call Analysis~~ ✓ Completed
- ~~Admin Dashboard v2~~ ✓ Completed (Vercel)
- ~~Security Hardening~~ ✓ Completed
- ~~Pipecat Migration~~ ✓ Completed (voice pipeline ported, Director ported)
- Pipecat context migration: `OpenAILLMContext` → `LLMContext` + `LLMContextAggregatorPair` (blocked — `AnthropicLLMService.create_context_aggregator()` requires `set_llm_adapter()` which only exists on `OpenAILLMContext` in v0.0.101. Revisit when pipecat updates the Anthropic adapter. Deprecation warnings are suppressed in `main.py`.)
- Prompt Caching (Anthropic)
- Telnyx Migration (65% cost savings)

---

*Last updated: February 2026 — Pipecat migration v4.0 with Conversation Director*
