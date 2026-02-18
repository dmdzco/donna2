# Donna Project - AI Context

> **AI Assistants**: You have permission to update this file as the project evolves. Keep it accurate and current.

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

## Current Status: Pipecat Migration (v4.0)

The voice pipeline has been migrated from Node.js to **Python Pipecat** (`pipecat/` directory). The Node.js legacy code remains in the repo root but is being replaced.

### Working Features (Pipecat)
- **2-Layer Observer Architecture + Post-Call**
  - Layer 1: Quick Observer (0ms) - 252 regex patterns + goodbye detection → GoodbyeGate
  - Layer 2: Conversation Director (~150ms) - Non-blocking Gemini Flash per-turn analysis
  - GoodbyeGate: False-goodbye protection (4s silence timer, mutual goodbye required)
  - Post-Call: Analysis, memory extraction, daily context (Gemini Flash)
- **Pipecat Flows** - 4-phase call state machine (opening → main → winding_down → closing)
- **4 LLM Tools** - search_memories, get_news, save_important_detail, mark_reminder_acknowledged
- **Programmatic Call Ending** - Quick Observer detects goodbye → GoodbyeGate (4s silence) → EndFrame (bypasses LLM)
- **Director Fallback Actions** - Force winding-down at 9min, force end at 12min
- **In-Call Memory Tracking** - Topics, questions, advice tracked per call (ConversationTracker)
- **Same-Day Cross-Call Memory** - Daily context persists across calls per senior per day
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

```
Twilio Audio ──► FastAPIWebsocketTransport
                        │
                   Deepgram STT (Nova 3)
                        │ TranscriptionFrame
                        ▼
              ┌─────────────────────┐
              │   Quick Observer     │  Layer 1 (0ms): 252 regex patterns
              │                      │  Goodbye → GoodbyeGate (4s)
              └─────────┬───────────┘
                        ▼
              ┌─────────────────────┐
              │ Conversation         │  Layer 2 (~150ms): Gemini Flash
              │ Director             │  NON-BLOCKING async analysis
              │                      │  Injects cached guidance per turn
              └─────────┬───────────┘
                        ▼
              Context Aggregator (user)
                        ▼
              Claude Sonnet 4.5 + Pipecat Flows
                        │ TextFrame
                        ▼
              Conversation Tracker (topics, questions, advice)
                        ▼
              Guidance Stripper (removes <guidance> tags)
                        ▼
              ElevenLabs TTS
                        ▼
              FastAPIWebsocketTransport ──► Twilio Audio
                        ▼
              Context Aggregator (assistant)
```

### Call Phase State Machine (Pipecat Flows)

| Phase | Tools | Context Strategy |
|-------|-------|-----------------|
| **Opening** | search_memories, save_important_detail, transition_to_main | respond_immediately |
| **Main** | search_memories, get_news, save_important_detail, mark_reminder_acknowledged, transition_to_winding_down | RESET_WITH_SUMMARY |
| **Winding Down** | mark_reminder_acknowledged, save_important_detail, transition_to_closing | APPEND |
| **Closing** | *(none — post_action ends call)* | APPEND |

### Post-Call Processing

On disconnect: complete conversation → call analysis (Gemini) → memory extraction (OpenAI) → daily context save → reminder cleanup → cache clear.

---

## Key Files (Pipecat)

```
pipecat/
├── main.py                          ← FastAPI entry point, /health, /ws, middleware
├── bot.py                           ← Pipeline assembly + run_bot() + _run_post_call()
│
├── flows/
│   ├── nodes.py                     ← 4 call phase NodeConfigs + system prompts (359 LOC)
│   └── tools.py                     ← 4 LLM tool schemas + async handlers (208 LOC)
│
├── processors/
│   ├── quick_observer.py            ← Layer 1: 252 regex patterns + goodbye detection (854 LOC)
│   ├── conversation_director.py     ← Layer 2: Gemini Flash non-blocking (180 LOC)
│   ├── conversation_tracker.py      ← Topic/question/advice tracking + transcript (239 LOC)
│   ├── goodbye_gate.py              ← Grace period before call ending, 4s timer (135 LOC)
│   └── guidance_stripper.py         ← Strip <guidance> tags before TTS (74 LOC)
│
├── services/
│   ├── director_llm.py              ← Gemini Flash analysis for Director (340 LOC)
│   ├── call_analysis.py             ← Post-call analysis (Gemini Flash) (222 LOC)
│   ├── memory.py                    ← Semantic memory (pgvector, decay) (351 LOC)
│   ├── scheduler.py                 ← Reminder scheduling + outbound calls (482 LOC)
│   ├── context_cache.py             ← Pre-cache at 5 AM local (261 LOC)
│   ├── conversations.py             ← Conversation CRUD (169 LOC)
│   ├── daily_context.py             ← Cross-call same-day memory (160 LOC)
│   ├── greetings.py                 ← Greeting templates + rotation (219 LOC)
│   ├── seniors.py                   ← Senior profile CRUD (99 LOC)
│   ├── caregivers.py                ← Caregiver-senior relationships (76 LOC)
│   └── news.py                      ← OpenAI web search (91 LOC)
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
├── tests/                           ← 14 test files
├── pyproject.toml                   ← Python 3.12, Pipecat v0.0.101+
└── Dockerfile                       ← python:3.12-slim + uv
```

### Legacy Node.js (repo root — being replaced)

```
/
├── index.js                    ← Express server (legacy)
├── pipelines/v1-advanced.js    ← Legacy voice pipeline
├── pipelines/quick-observer.js ← Legacy Quick Observer (JS)
├── pipelines/fast-observer.js  ← Legacy Conversation Director (JS)
├── services/                   ← Legacy services (JS)
├── routes/                     ← 16 route modules (JS)
├── middleware/                  ← 7 middleware files (JS)
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
| Change conversation behavior | `pipecat/flows/nodes.py` (system prompts per phase) |
| Add/modify LLM tools | `pipecat/flows/tools.py` (schemas + handlers) |
| Modify Quick Observer patterns | `pipecat/processors/quick_observer.py` |
| Modify Conversation Director | `pipecat/processors/conversation_director.py` + `pipecat/services/director_llm.py` |
| Modify call ending behavior | `pipecat/processors/quick_observer.py` (goodbye detection) + `pipecat/processors/goodbye_gate.py` (grace period) + `pipecat/processors/conversation_director.py` (time-based) |
| Change pipeline assembly | `pipecat/bot.py` |
| Modify post-call processing | `pipecat/bot.py` (_run_post_call) |
| Modify post-call analysis | `pipecat/services/call_analysis.py` |
| Modify memory system | `pipecat/services/memory.py` |
| Modify greeting templates | `pipecat/services/greetings.py` |
| Modify context pre-caching | `pipecat/services/context_cache.py` |
| Modify cross-call daily context | `pipecat/services/daily_context.py` |
| Modify reminder scheduling | `pipecat/services/scheduler.py` |
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

1. **`pipecat/docs/ARCHITECTURE.md`** - Pipeline diagrams, file structure, tech stack
2. **`claude.md`** (this file) - Working features, key files, AI assistant reference
3. **`README.md`** - Features, quick start, project structure
4. **`docs/architecture/OVERVIEW.md`** - High-level architecture overview

### Deployment

**Pipecat (Railway):**
```bash
cd pipecat && railway up
```

Railway project: `36e40dcb-ada1-4df5-9465-627d3cfdff71`
Service: `donna-pipecat` (port 7860)
URL: `https://donna-pipecat-production.up.railway.app`

**Node.js legacy (Railway):**
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

# Optional
FAST_OBSERVER_MODEL=gemini-3-flash-preview  # Director model
```

---

## Roadmap

- ~~Streaming Pipeline~~ ✓ Completed
- ~~Dynamic Token Routing~~ ✓ Completed
- ~~Conversation Director~~ ✓ Completed (both Node.js and Pipecat)
- ~~Post-Call Analysis~~ ✓ Completed
- ~~Admin Dashboard v2~~ ✓ Completed (Vercel)
- ~~Security Hardening~~ ✓ Completed
- ~~Pipecat Migration~~ ✓ In progress (voice pipeline ported, Director ported)
- Prompt Caching (Anthropic)
- Full Pipecat cutover (disable Node.js, enable scheduler on Pipecat)
- Telnyx Migration (65% cost savings)

---

*Last updated: February 2026 — Pipecat migration v4.0 with Conversation Director*
