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

## Current Status: v5.0

The voice pipeline runs on **Python Pipecat** (`pipecat/` directory). Node.js (repo root) serves admin/consumer APIs and the reminder scheduler. See "Architecture Decision: Two Backends" below.

### Working Features (Pipecat)
- **2-Layer Observer Architecture + Post-Call**
  - Layer 1: Quick Observer (0ms) - 268 regex patterns + programmatic goodbye (2s EndFrame)
  - Layer 2: Conversation Director (~150ms) - Non-blocking Gemini Flash per-turn analysis + mid-call memory refresh
  - Post-Call: Analysis, memory extraction, daily context (Gemini Flash)
- **Pipecat Flows** - 4-phase call state machine (opening → main → winding_down → closing)
- **5 LLM Tools** - search_memories, get_news, save_important_detail, mark_reminder_acknowledged, check_caregiver_notes
- **Programmatic Call Ending** - Quick Observer detects goodbye → EndFrame after 2s delay (bypasses LLM)
- **Director Fallback Actions** - Force winding-down at 9min, force end at 12min (configurable per-senior)
- **Full In-Call Context Retention** - APPEND strategy keeps complete conversation history (no summary truncation)
- **Cross-Call Turn History** - Recent turns from previous calls loaded into system prompt via `get_recent_turns()`
- **In-Call Memory Tracking** - Topics, questions, advice tracked per call (ConversationTracker)
- **Mid-Call Memory Refresh** - After 5+ minutes, refreshes context with current conversation topics
- **Same-Day Cross-Call Memory** - Daily context + call summaries persist across calls per senior per day
- **Sentiment-Aware Greetings** - Uses last call's engagement/rapport score for greeting tone
- **Semantic Memory** - pgvector with HNSW index + decay + deduplication + tiered retrieval
- **Caregiver Notes** - Family can leave notes that are read during calls (check_caregiver_notes tool)
- **Per-Senior Call Settings** - Configurable time limits, greeting style, memory decay via `call_settings` JSONB
- **Scheduled Reminder Calls** - Polling scheduler with prefetch + delivery tracking
- **Context Pre-caching** - Senior context cached at 5 AM local time
- Real-time voice calls (Twilio Media Streams → Pipecat WebSocket)
- Speech transcription (Deepgram Nova 3 via Pipecat)
- LLM responses (Claude Sonnet 4.5 via Pipecat AnthropicLLMService)
- TTS (ElevenLabs via Pipecat)
- VAD (Silero — confidence=0.6, stop_secs=1.2, min_volume=0.5)
- News via OpenAI web search (1hr cache)
- Security: JWT admin auth, API key auth, Twilio webhook validation, rate limiting, security headers

### Infrastructure & Reliability (v5.0)
- **Circuit Breakers** - Gemini (5s), OpenAI embedding (10s), news (10s) — `lib/circuit_breaker.py`
- **Feature Flags** - DB-backed with 5-min cache — `lib/feature_flags.py`
- **Graceful Shutdown** - Tracks active calls, 7s drain on SIGTERM
- **Enhanced /health** - Database connectivity + circuit breaker states
- **CI/CD Pipelines** - PR → tests → staging → smoke tests; push to main → production
- **Multi-Environment** - dev/staging/production with Neon branching + Railway environments

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
              │                      │  Strong goodbye → EndFrame in 2s
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
| **Opening** | search_memories, save_important_detail, check_caregiver_notes, transition_to_main | APPEND, respond_immediately |
| **Main** | search_memories, get_news, save_important_detail, mark_reminder_acknowledged, check_caregiver_notes, transition_to_winding_down | APPEND |
| **Winding Down** | mark_reminder_acknowledged, save_important_detail, transition_to_closing | APPEND |
| **Closing** | *(none — post_action: end_conversation)* | APPEND |

### Post-Call Processing

On disconnect: complete conversation → call analysis (Gemini) → summary persistence → memory extraction (OpenAI) → daily context save → reminder cleanup → cache clear.

---

## Key Files (Pipecat)

```
pipecat/
├── main.py                          ← FastAPI entry, /health, /ws, graceful shutdown (258 LOC)
├── bot.py                           ← Pipeline assembly + sentiment greetings (335 LOC)
├── config.py                        ← All env vars centralized (110 LOC)
├── prompts.py                       ← System prompts + phase task instructions (129 LOC)
│
├── flows/
│   ├── nodes.py                     ← 4 call phase NodeConfigs (imports prompts.py) (319 LOC)
│   └── tools.py                     ← 5 LLM tool schemas + closure-based handlers (269 LOC)
│
├── processors/
│   ├── patterns.py                  ← Pattern data: 268 regex patterns, 19 categories (503 LOC)
│   ├── quick_observer.py            ← Layer 1: analysis logic + goodbye EndFrame (392 LOC)
│   ├── conversation_director.py     ← Layer 2: Gemini Flash + mid-call memory refresh (219 LOC)
│   ├── conversation_tracker.py      ← Topic/question/advice tracking + transcript (254 LOC)
│   ├── metrics_logger.py            ← Call metrics logging processor (97 LOC)
│   ├── goodbye_gate.py              ← False-goodbye grace period — NOT in active pipeline (135 LOC)
│   └── guidance_stripper.py         ← Strip <guidance> tags + [BRACKETED] directives (115 LOC)
│
├── services/
│   ├── scheduler.py                 ← Reminder polling + outbound calls (427 LOC)
│   ├── reminder_delivery.py         ← Delivery CRUD + prompt formatting (95 LOC)
│   ├── post_call.py                 ← Post-call: analysis, memory, cleanup (166 LOC)
│   ├── director_llm.py              ← Gemini Flash analysis for Director (374 LOC)
│   ├── call_analysis.py             ← Post-call analysis + call quality scoring (246 LOC)
│   ├── memory.py                    ← Semantic memory (pgvector, HNSW, circuit breaker) (392 LOC)
│   ├── interest_discovery.py        ← Interest extraction from conversations (183 LOC)
│   ├── context_cache.py             ← Pre-cache at 5 AM local (290 LOC)
│   ├── conversations.py             ← Conversation CRUD (250 LOC)
│   ├── daily_context.py             ← Cross-call same-day memory (161 LOC)
│   ├── greetings.py                 ← Sentiment-aware greeting templates + rotation (326 LOC)
│   ├── seniors.py                   ← Senior profile + per-senior call_settings (131 LOC)
│   ├── caregivers.py                ← Caregiver relationships + notes delivery (101 LOC)
│   └── news.py                      ← OpenAI web search + circuit breaker (213 LOC)
│
├── lib/
│   ├── circuit_breaker.py           ← Async circuit breaker for external services (84 LOC)
│   ├── feature_flags.py             ← DB-backed feature flags, 5-min cache (41 LOC)
│   └── sanitize.py                  ← PII-safe logging
│
├── api/
│   ├── routes/
│   │   ├── voice.py                 ← /voice/answer (TwiML), /voice/status (230 LOC)
│   │   └── calls.py                 ← /api/call, /api/calls
│   ├── middleware/                   ← auth, api_auth, rate_limit, security, twilio, error_handler
│   └── validators/schemas.py        ← Pydantic input validation
│
├── db/
│   ├── client.py                    ← asyncpg pool + query helpers + health check (69 LOC)
│   └── migrations/                  ← SQL migrations (HNSW index, feature_flags table)
├── tests/                           ← 61 test files + helpers/mocks/scenarios
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

## Development Workflow

### Three Environments

Donna runs three fully isolated environments. Each has its own Railway services, Neon database branch, and Twilio phone number.

| Environment | Purpose | Database | Twilio # | Pipecat URL | API URL |
|---|---|---|---|---|---|
| **production** | Live customers | Neon `main` branch | +18064508649 | donna-pipecat-production.up.railway.app | donna-api-production-2450.up.railway.app |
| **staging** | Pre-merge CI validation | Neon `staging` branch | +19789235477 | (created on deploy) | (created on deploy) |
| **dev** | Your experiments | Neon `dev` branch | +19789235477 | donna-pipecat-dev.up.railway.app | donna-api-dev.up.railway.app |

**Isolation guarantees:**
- Each environment has its own database (Neon copy-on-write branches) — bad writes in dev never touch production data
- Each environment uses its own Twilio phone number — dev calls never reach real seniors
- API keys (Anthropic, Deepgram, ElevenLabs, etc.) are shared across environments (safe — they're stateless services)

### Daily Development Workflow

```
# 1. Work on a feature branch
git checkout -b feat/better-greetings

# 2. Edit code locally
#    (e.g., change pipecat/services/greetings.py)

# 3. Deploy to dev (deploys whatever code is in your working directory)
make deploy-dev-pipecat          # ~30s — just Pipecat (fastest)
make deploy-dev                  # ~60s — both Pipecat + Node.js API

# 4. Test with a real call
#    Call +19789235477 (dev number) from your phone

# 5. Check logs if something's wrong
make logs-dev

# 6. Iterate: edit → deploy → call → repeat

# 7. When happy, push and open PR
git push -u origin feat/better-greetings
gh pr create
#    → CI runs tests → deploys to staging → smoke tests

# 8. Merge to main
#    → CI auto-deploys to production
```

### Git Branches vs Railway Environments

**Railway environments are NOT tied to git branches.** `make deploy-dev` uploads your current working directory to the dev environment, regardless of which git branch you're on. This is intentional — you can test any branch in dev without ceremony.

**The only automated git→deploy connections are:**
- **PR to `main`** → CI deploys to staging (after tests pass)
- **Push to `main`** → CI deploys to production

### Neon Database Branches

Neon branches are copy-on-write snapshots of the production database. The `dev` and `staging` branches contain all production data (seniors, memories, reminders) but changes stay isolated.

```bash
# Reset dev database to a fresh copy of production (if data gets messy)
neonctl branches delete dev --project-id ancient-hill-13451362 --org-id org-sparkling-voice-59093323
neonctl branches create --name dev --project-id ancient-hill-13451362 --org-id org-sparkling-voice-59093323
# Then update DATABASE_URL in Railway dev environment if the connection string changes
```

### Makefile Commands

```bash
# Deploy
make deploy-dev              # Both services to dev
make deploy-dev-pipecat      # Just Pipecat to dev (fastest for voice changes)
make deploy-staging          # Both services to staging
make deploy-prod             # Both services to production

# Health checks
make health-dev              # Check dev services are up
make health-staging          # Check staging
make health-prod             # Check production

# Logs
make logs-dev                # Tail dev Pipecat logs
make logs-staging            # Tail staging logs
make logs-prod               # Tail production logs

# Tests (run locally)
make test                    # All tests (Python + Node.js)
make test-python             # Pipecat tests only
make test-node               # Node.js tests only
make test-regression         # Regression scenario tests

# First-time setup
make setup                   # Create Neon branches + Railway environments
```

### Railway Services

The Railway project has two services per environment:

| Service | Railway Name | Port | Responsibility |
|---|---|---|---|
| Pipecat (Python) | `donna-pipecat` | 7860 | Voice pipeline: STT → Observer → Director → Claude → TTS |
| Node.js API | `donna-api` | 3001 | Admin/consumer APIs, reminder scheduler, call initiation |

**Railway CLI is linked to production by default.** Use `--environment dev` or `--environment staging` flags for other environments. If you switch with `railway environment dev`, remember to switch back with `railway environment production`.

### Testing Strategy

- **Unit tests (local):** `make test` — runs Python + Node.js tests, no external deps needed
- **Voice/call features:** Deploy to dev, test with real phone calls to dev number
- **Frontend apps:** Run locally against dev API, or deploy to Vercel
- **Regression:** `make test-regression` — scenario-based tests run in CI on every PR

**Do NOT** test voice features locally with ngrok — always deploy to Railway dev environment

---

## For AI Assistants

### When Making Changes (Pipecat)

| Task | Where to Look |
|------|---------------|
| Change conversation behavior | `pipecat/prompts.py` (prompt text) + `pipecat/flows/nodes.py` (flow logic) |
| Add/modify LLM tools | `pipecat/flows/tools.py` (schemas + handlers) |
| Modify Quick Observer patterns | `pipecat/processors/patterns.py` (data) + `pipecat/processors/quick_observer.py` (logic) |
| Modify Conversation Director | `pipecat/processors/conversation_director.py` + `pipecat/services/director_llm.py` |
| Modify call ending behavior | `pipecat/processors/quick_observer.py` (goodbye detection) + `pipecat/processors/goodbye_gate.py` (grace period) + `pipecat/processors/conversation_director.py` (time-based) |
| Change pipeline assembly | `pipecat/bot.py` |
| Modify post-call processing | `pipecat/services/post_call.py` |
| Modify post-call analysis | `pipecat/services/call_analysis.py` |
| Modify memory system | `pipecat/services/memory.py` |
| Modify greeting templates | `pipecat/services/greetings.py` |
| Modify context pre-caching | `pipecat/services/context_cache.py` |
| Modify cross-call daily context | `pipecat/services/daily_context.py` |
| Modify reminder scheduling | `pipecat/services/scheduler.py` (polling) + `pipecat/services/reminder_delivery.py` (CRUD) |
| Modify per-senior call settings | `pipecat/services/seniors.py` (`get_call_settings()`) |
| Modify caregiver notes delivery | `pipecat/services/caregivers.py` + `pipecat/flows/tools.py` |
| Modify circuit breaker behavior | `pipecat/lib/circuit_breaker.py` |
| Modify feature flags | `pipecat/lib/feature_flags.py` + `feature_flags` DB table |
| Check/add environment variables | `pipecat/config.py` |
| Modify in-call tracking | `pipecat/processors/conversation_tracker.py` |
| Modify guidance stripping | `pipecat/processors/guidance_stripper.py` |
| Add API routes | `pipecat/api/routes/` |
| Modify auth/middleware | `pipecat/api/middleware/` |
| Database queries | `pipecat/db/client.py` |
| Server setup / graceful shutdown | `pipecat/main.py` |
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

Three environments: **dev** (your experiments), **staging** (pre-merge CI), **production** (customers).

```bash
# Quick deploy (use Makefile)
make deploy-dev              # Deploy both services to dev
make deploy-dev-pipecat      # Deploy only Pipecat to dev (faster iteration)
make deploy-staging          # Deploy both to staging
make deploy-prod             # Deploy both to production

# Health checks
make health-dev
make health-prod

# Logs
make logs-dev
```

See the **Development Workflow** section above for full environment details, Makefile commands, and iteration workflow.

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
- ~~Multi-Environment Workflow~~ ✓ Completed (dev/staging/prod with Neon branching + Railway environments)
- ~~Infrastructure Reliability (v5.0)~~ ✓ Completed (circuit breakers, feature flags, graceful shutdown, enhanced /health)
- ~~Conversation Quality (v5.0)~~ ✓ Completed (sentiment greetings, mid-call memory refresh, caregiver notes, per-senior settings, HNSW index)
- ~~CI/CD Pipelines~~ ✓ Completed (GitHub Actions: tests → staging → production)
- Pipecat context migration: `OpenAILLMContext` → `LLMContext` + `LLMContextAggregatorPair` (blocked — `AnthropicLLMService.create_context_aggregator()` requires `set_llm_adapter()` which only exists on `OpenAILLMContext` in v0.0.101. Revisit when pipecat updates the Anthropic adapter. Deprecation warnings are suppressed in `main.py`.)
- Prompt Caching (Anthropic)
- Telnyx Migration (65% cost savings)

---

*Last updated: February 2026 — v5.0 with circuit breakers, feature flags, caregiver notes, sentiment-aware greetings, CI/CD*
