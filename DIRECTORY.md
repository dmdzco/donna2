# Donna Codebase Directory

> **Read this FIRST before writing any code.** This tells you what each directory does and where to make changes. Designed for AI agents — read only what's relevant to your task.

---

## Quick Reference: Where Do I Make Changes?

| I need to... | Go to |
|---|---|
| Change what Donna says / conversation behavior | `pipecat/prompts.py` (prompt text) + `pipecat/flows/nodes.py` (flow logic) |
| Add or modify LLM tools | `pipecat/flows/tools.py` |
| Change Quick Observer pattern detection | `pipecat/processors/patterns.py` (data) + `pipecat/processors/quick_observer.py` (logic) |
| Change Conversation Director behavior | `pipecat/processors/conversation_director.py` + `pipecat/services/director_llm.py` |
| Change how calls end | `pipecat/processors/quick_observer.py` (goodbye) + `pipecat/processors/conversation_director.py` (time limits) |
| Change the voice pipeline order | `pipecat/bot.py` |
| Change post-call processing | `pipecat/services/post_call.py` |
| Change post-call analysis prompts | `pipecat/services/call_analysis.py` |
| Change memory search/storage | `pipecat/services/memory.py` |
| Change greeting templates | `pipecat/services/greetings.py` |
| Change context pre-caching | `pipecat/services/context_cache.py` |
| Change reminder scheduling | `pipecat/services/scheduler.py` (polling/calls) + `pipecat/services/reminder_delivery.py` (delivery CRUD) |
| Check all environment variables | `pipecat/config.py` |
| Add Pipecat API routes | `pipecat/api/routes/` |
| Change Pipecat auth/middleware | `pipecat/api/middleware/` |
| Change database queries (Python) | `pipecat/db/client.py` |
| Change Pipecat server startup | `pipecat/main.py` |
| Change admin dashboard UI | `apps/admin-v2/src/pages/` |
| Change admin API client | `apps/admin-v2/src/lib/api.ts` |
| Change consumer app | `apps/consumer/src/` |
| Change admin/consumer API endpoints | `routes/*.js` (Node.js — serves all /api/* for frontends) |
| Change admin API middleware/auth | `middleware/*.js` (Node.js) |
| Change database schema | `db/schema.js` (Drizzle ORM, shared by both backends) |

---

## Two Backends in Production

Donna runs two backend services. Change the wrong one and nothing happens.

```
                  ┌─────────────────────────────────┐
  Phone Call ───► │  Pipecat (Python, Railway:7860)  │  Voice pipeline: STT → Observer →
  (Twilio)        │  pipecat/ directory               │  Director → Claude → TTS
                  └──────────────┬──────────────────┘
                                 │
                     Shared DB (Neon PostgreSQL)
                                 │
                  ┌──────────────┴──────────────────┐
  Admin UI ─────► │  Node.js (Express, Railway:3001) │  Admin/consumer APIs, scheduler,
  Consumer UI ──► │  repo root: index.js              │  call initiation, post-call analysis
                  └─────────────────────────────────┘

  Frontends (Vercel) ──► Node.js APIs only ──► never talk to Pipecat directly
```

**Call lifecycle across both backends:**
1. Caregiver hits "Call" → Node.js `/api/call` prefetches context → creates Twilio call
2. Twilio answers → Node.js `/voice/answer` returns TwiML pointing to Pipecat WebSocket
3. Call connects → **Pipecat handles all voice** (STT, Quick Observer, Director, Claude, TTS)
4. Call ends → Pipecat runs post-call analysis, saves memories, updates daily context

---

## Directory Map

### `pipecat/` — Voice Pipeline (Python, 7.2k LOC)

The primary codebase. All voice/call features live here. **Clean architecture: no circular imports, flat service dependencies.**

```
pipecat/
├── main.py              FastAPI entry: /health, /ws, middleware setup (156 LOC)
├── bot.py               Pipeline assembly — imports run_post_call from services (280 LOC)
├── config.py            All environment variables, centralized (95 LOC)
├── prompts.py           System prompts + phase task instructions (92 LOC)
│
├── flows/               Call state machine (Pipecat Flows)
│   ├── nodes.py         4 phases: opening → main → winding_down → closing (315 LOC)
│   │                    Imports prompts from prompts.py
│   └── tools.py         4 LLM tool schemas + closure-based handlers (227 LOC)
│
├── processors/          Frame processors in the audio pipeline
│   ├── patterns.py             Pattern data: 268 regex patterns, 19 categories (570 LOC)
│   ├── quick_observer.py       Layer 1: analysis logic + goodbye detection (375 LOC)
│   ├── conversation_director.py Layer 2: Gemini Flash guidance injection (180 LOC)
│   ├── conversation_tracker.py  Tracks topics/questions/advice per call (239 LOC)
│   ├── goodbye_gate.py          False-goodbye grace period (135 LOC)
│   └── guidance_stripper.py     Strips <guidance> tags before TTS (74 LOC)
│
├── services/            Business logic — mostly independent, DB-only deps
│   ├── scheduler.py         Reminder polling + outbound calls (403 LOC)
│   ├── reminder_delivery.py Delivery CRUD + prompt formatting (85 LOC)
│   ├── post_call.py         Post-call orchestration: analysis, memory, cleanup (97 LOC)
│   ├── memory.py            Semantic memory: pgvector, decay, dedup (356 LOC)
│   ├── director_llm.py      Gemini Flash analysis prompts (339 LOC)
│   ├── context_cache.py     Pre-cache senior context at 5 AM (260 LOC)
│   ├── call_analysis.py     Post-call analysis via Gemini (221 LOC)
│   ├── greetings.py         Greeting templates + rotation (218 LOC)
│   ├── conversations.py     Conversation CRUD (168 LOC)
│   ├── daily_context.py     Same-day cross-call memory (159 LOC)
│   ├── seniors.py           Senior profile CRUD (99 LOC)
│   ├── news.py              OpenAI web search, 1hr cache (91 LOC)
│   └── caregivers.py        Caregiver relationships (76 LOC)
│
├── api/                 HTTP layer (291 LOC total)
│   ├── routes/voice.py      /voice/answer (TwiML), /voice/status
│   ├── routes/calls.py      /api/call, /api/calls
│   ├── middleware/           auth, api_auth, rate_limit, security, twilio, error_handler
│   └── validators/schemas.py  Pydantic request validation (142 LOC)
│
├── db/client.py         asyncpg pool + query helpers (56 LOC)
├── lib/sanitize.py      PII masking for logs (38 LOC)
├── tests/               14 test files, 163+ tests
├── docs/ARCHITECTURE.md Full architecture docs
├── pyproject.toml       Python 3.12, dependencies
└── Dockerfile           python:3.12-slim + uv
```

**Service dependency graph** (most services only import `db`):
```
context_cache → seniors, conversations, memory, greetings  (orchestrator)
scheduler → memory, context_cache                           (needs context for calls)
All other services → db only                                (independent)
```

### `apps/` — Frontend Applications (React, Vercel)

All frontends call Node.js `/api/*` endpoints. They never talk to Pipecat.

```
apps/
├── admin-v2/        PRIMARY admin dashboard (React + Vite + Tailwind)
│   ├── src/pages/   Dashboard, Seniors, Calls, Reminders, CallAnalyses, Caregivers, Login
│   ├── src/lib/     api.ts (API client → Node.js), auth.ts (JWT)
│   └── Live: https://admin-v2-liart.vercel.app
│
├── consumer/        Caregiver app (React + Vite + Clerk auth + Radix UI)
│   ├── src/pages/   Landing, Onboarding, Dashboard, FAQ
│   └── Auth: Clerk OAuth
│
└── observability/   Call monitoring dashboard (REST polling, low use)
```

### Root Node.js — Admin APIs + Scheduler (Active, ~4.4k LOC)

Serves all API endpoints that frontends consume. Also runs the reminder scheduler.

```
/
├── index.js             Express server entry (101 LOC) — CORS, middleware, scheduler start
│
├── routes/              16 files, 1.2k LOC — all /api/* endpoints
│   ├── voice.js         /voice/answer → returns TwiML pointing to Pipecat WebSocket (146 LOC)
│   ├── calls.js         /api/call — initiate manual outbound call (66 LOC)
│   ├── seniors.js       CRUD /api/seniors (126 LOC)
│   ├── reminders.js     CRUD /api/reminders + delivery tracking (127 LOC)
│   ├── observability.js Call monitoring endpoints (368 LOC)
│   ├── onboarding.js    Consumer onboarding flow (88 LOC)
│   ├── admin-auth.js    JWT admin login (89 LOC)
│   ├── stats.js         Dashboard statistics (69 LOC)
│   ├── memories.js      Memory search/store (63 LOC)
│   ├── daily-context.js Daily context queries (54 LOC)
│   ├── caregivers.js    Caregiver management (53 LOC)
│   ├── conversations.js Conversation history (39 LOC)
│   ├── call-analyses.js Analysis results (37 LOC)
│   └── health.js, helpers.js, index.js
│
├── services/            10 files, 2.5k LOC — dual implementation with pipecat/services/
│   ├── scheduler.js     Reminder polling + outbound calls (489 LOC)
│   ├── context-cache.js Pre-cache senior context (364 LOC)
│   ├── memory.js        Semantic memory, pgvector (336 LOC)
│   ├── call-analysis.js Post-call Gemini analysis (256 LOC)
│   ├── greetings.js     Greeting templates (257 LOC)
│   ├── daily-context.js Cross-call memory (196 LOC)
│   ├── conversations.js Conversation CRUD (175 LOC)
│   ├── news.js          OpenAI web search (103 LOC)
│   ├── caregivers.js    Caregiver relationships (90 LOC)
│   └── seniors.js       Senior profiles (77 LOC)
│
├── middleware/           7 files, 671 LOC
│   ├── auth.js          Clerk + JWT mixed auth (198 LOC)
│   ├── validate.js      Zod request validation (164 LOC)
│   ├── rate-limit.js    5 rate limiter configs (98 LOC)
│   ├── twilio.js        Webhook signature validation (83 LOC)
│   ├── api-auth.js      API key auth (55 LOC)
│   ├── security.js      Security headers (40 LOC)
│   └── error-handler.js Error formatting (33 LOC)
│
├── db/
│   ├── schema.js        9 Drizzle tables: seniors, conversations, memories, reminders, etc.
│   ├── client.js        Neon PostgreSQL + Drizzle ORM init
│   └── setup-pgvector.js
│
├── validators/schemas.js  Zod validation schemas (291 LOC)
├── lib/                   logger.js, sanitize.js
└── tests/                 4 test files + fixtures/mocks/helpers
```

**Dual implementations (by design):** Every `services/*.js` file has an equivalent `pipecat/services/*.py`. Both read/write the same database. This is intentional — each backend needs DB access for its own responsibilities. If you change DB schema or query logic, check both.

### `docs/` — Documentation

```
docs/
├── PRODUCT_PLAN.md               Product roadmap (40KB)
├── README.md                     Documentation index
├── architecture/OVERVIEW.md      v4.0 high-level architecture (current)
├── plans/
│   └── 2026-02-05-multi-senior-management.md   Feature plan (may be active)
├── guides/
│   └── DEPLOYMENT_PLAN.md        Railway deployment guide
└── decisions/                    Historical decisions + completed plans (reference only):
    ├── DONNA_ON_PIPECAT.md, DONNA_ON_LIVEKIT.md, VOICE_AI_FRAMEWORK_ANALYSIS.md
    ├── ARCHITECTURE.md, ARCHITECTURE_ASSESSMENT.md
    └── 2026-02-05-pipecat-migration*.md, 2026-02-05-security-hardening.md
```

---

## Architectural Patterns (Follow These)

1. **Lazy client init** — Services use `_client = None` + `_get_client()`. Never instantiate API clients at import time.

2. **Closure-based tool handlers** — `flows/tools.py` creates handlers via closure over `session_state` dict. This is how per-call state flows through Pipecat.

3. **In-memory caching** — `context_cache.py`, `news.py`, `scheduler.py` use module-level dicts. Per-process, lost on restart.

4. **Async everywhere** — All Python service functions are `async`. DB is `asyncpg`. Use `asyncio.create_task()` for fire-and-forget work.

5. **PII-safe logging** — Always use `lib/sanitize.py` when logging user data. Never log phone numbers or conversation content raw.

6. **Processors are pipeline-independent** — Quick Observer, Director, Tracker don't import services (except Director→director_llm). They process frames and pass them downstream.

---

## Large Files (Context Budget Warning)

Only load these when your task specifically requires them.

| File | LOC | Why it's big |
|---|---|---|
| `pipecat/processors/patterns.py` | 570 | 268 regex patterns, 19 categories (pure data) |
| `pipecat/services/scheduler.py` | 403 | Polling + call triggering + prefetch + state |
| `pipecat/processors/quick_observer.py` | 375 | Analysis logic + goodbye detection |
| `pipecat/services/memory.py` | 356 | pgvector search + decay + dedup + tiered retrieval |
| `pipecat/services/director_llm.py` | 339 | Gemini Flash analysis prompts + response parsing |
| `pipecat/flows/nodes.py` | 315 | 4-phase flow config + context builders |
| `services/scheduler.js` | 489 | Node.js reminder polling (mirrors pipecat scheduler) |
| `services/context-cache.js` | 364 | Node.js context pre-caching |
| `routes/observability.js` | 368 | Call monitoring + metrics aggregation |

---

## Testing

```bash
# Pipecat (primary — 14 files, 163+ tests)
cd pipecat && python -m pytest tests/

# Node.js (4 test files + e2e)
npm test

# E2E (Playwright — admin dashboard)
npx playwright test
```

Test files follow `pipecat/tests/test_<module>.py` naming.

---

## Deployment

```bash
# Pipecat voice pipeline (Railway)
cd pipecat && railway up

# Node.js admin API (Railway)
railway up   # from repo root

# Admin dashboard (Vercel)
cd apps/admin-v2 && npx vercel --prod --yes
```

---

*Source of truth for codebase navigation. Update when directories or responsibilities change.*
