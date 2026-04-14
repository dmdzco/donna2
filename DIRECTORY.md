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
| Change predictive prefetch | `pipecat/services/prefetch.py` (cache + extraction) + `pipecat/processors/conversation_director.py` (orchestration) |
| Change in-call web search | `pipecat/services/news.py` (Tavily/OpenAI search) + `pipecat/flows/tools.py` (Claude tool schema/handler) |
| Change greeting templates | `pipecat/services/greetings.py` |
| Change context pre-caching | `pipecat/services/context_cache.py` |
| Change reminder scheduling | `services/scheduler.js` (active polling/calls) + `routes/reminders.js`; touch `pipecat/services/reminder_delivery.py` only for in-call delivery acknowledgment |
| Change per-senior call settings | `pipecat/services/seniors.py` (`get_call_settings()`) |
| Change caregiver notes delivery | `pipecat/services/caregivers.py` + `pipecat/flows/tools.py` |
| Change circuit breaker behavior | `pipecat/lib/circuit_breaker.py` |
| Change feature flags | `pipecat/lib/growthbook.py` (GrowthBook Cloud SDK) |
| Check all environment variables | `pipecat/config.py` |
| Add Pipecat API routes | `pipecat/api/routes/` |
| Change Pipecat auth/middleware | `pipecat/api/middleware/` |
| Change database queries (Python) | `pipecat/db/client.py` |
| Change Pipecat server startup | `pipecat/main.py` |
| Change Twilio answer/status path | `pipecat/api/routes/voice.py` |
| Change frontend/manual call initiation | `routes/calls.js` (Node creates the Twilio call with Pipecat webhook URLs) |
| Change admin dashboard UI | `apps/admin-v2/src/pages/` |
| Change admin API client | `apps/admin-v2/src/lib/api.ts` |
| Change consumer app | `apps/consumer/src/` |
| Change admin/consumer API endpoints | `routes/*.js` (Node.js — serves all /api/* for frontends) |
| Change admin API middleware/auth | `middleware/*.js` (Node.js) |
| Change database schema | `db/schema.js` (Drizzle ORM, shared app/API schema) + `pipecat/db/migrations/` (Pipecat/shared runtime additions) |
| Add/modify frontend E2E tests | `tests/e2e/` + `playwright.config.ts` — see [guide](docs/guides/FRONTEND_TESTING.md) |
| Change data retention policies | `pipecat/services/data_retention.py` (Python) + `services/data-retention.js` (Node.js) |
| Change audit logging | `pipecat/services/audit.py` (Python) + `services/audit.js` (Node.js) |
| Change token revocation | `pipecat/services/token_revocation.py` (Python) + `services/token-revocation.js` (Node.js) |
| Change field encryption | `pipecat/lib/encryption.py` (Python) + `lib/encryption.js` (Node.js) |
| Review HIPAA compliance docs | `docs/compliance/` (overview, BAAs, breach notification, retention, vendor security) |

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
  Consumer UI ──► │  repo root: index.js              │  call initiation
                  └─────────────────────────────────┘

  Frontends (Vercel) ──► Node.js APIs only ──► never talk to Pipecat directly
```

**Call lifecycle (Pipecat path — primary):**
1. Call arrives (inbound, scheduled, or manual; frontends initiate manual calls through Node `/api/call`)
2. Pipecat `/voice/answer` fetches senior context, creates conversation record, returns TwiML `<Stream url="/ws">`
3. Twilio connects WebSocket → **Pipecat runs full pipeline** (STT → Observer → Director → Claude → TTS)
4. Call ends → Pipecat `services/post_call.py` runs analysis, memory extraction, daily context save

**Note:** Frontends hit Node.js APIs for call initiation. The active Node `routes/calls.js` sets Twilio callbacks to Pipecat `/voice/answer` and `/voice/status`; there is no active root Node `routes/voice.js` route.

---

## Directory Map

### `pipecat/` — Voice Pipeline (Python, 7.7k LOC)

The primary codebase. All voice/call features live here. **Clean architecture: no circular imports, flat service dependencies.**

```
pipecat/
├── main.py              FastAPI entry: /health, /ws, graceful shutdown (375 LOC)
├── bot.py               Pipeline assembly + sentiment-aware greetings (542 LOC)
├── config.py            All environment variables, centralized (110 LOC)
├── prompts.py           System prompts + phase task instructions (78 LOC)
│
├── flows/               Call state machine (Pipecat Flows)
│   ├── nodes.py         Conditional reminder → main → winding_down → closing (+ onboarding) (554 LOC)
│   │                    Imports prompts from prompts.py
│   └── tools.py         2 active Claude tools (web_search, mark_reminder_acknowledged) + retired handlers (385 LOC)
│
├── processors/          Frame processors in the audio pipeline
│   ├── patterns.py             250+ regex patterns across 19 Quick Observer categories (503 LOC)
│   ├── quick_observer.py       Layer 1: analysis logic + goodbye detection (402 LOC)
│   ├── conversation_director.py Layer 2: Split Director (Query + Guidance) + memory/news injection + ephemeral context (750 LOC)
│   ├── conversation_tracker.py  Tracks topics/questions/advice per call (246 LOC)
│   ├── metrics_logger.py        Call metrics + prefetch stats logging (110 LOC)
│   ├── goodbye_gate.py          False-goodbye grace period — NOT in active pipeline (135 LOC)
│   └── guidance_stripper.py     Strips <guidance> tags before TTS (115 LOC)
│
├── services/            Business logic — mostly independent, DB-only deps
│   ├── scheduler.py         Pipecat-side reminder polling helpers; Node scheduler is active (529 LOC)
│   ├── reminder_delivery.py Delivery CRUD + prompt formatting (95 LOC)
│   ├── post_call.py         Post-call orchestration: analysis, memory, cleanup, snapshot rebuild (338 LOC)
│   ├── memory.py            Semantic memory: pgvector, HNSW, decay, dedup, circuit breaker (494 LOC)
│   ├── prefetch.py          Predictive Context Engine: cache, extraction, runner (250 LOC)
│   ├── director_llm.py      Split Director LLM: Query Director (~200ms) + Guidance Director (~400ms) (593 LOC)
│   ├── call_snapshot.py     Pre-computed call context snapshot for seniors (53 LOC)
│   ├── context_cache.py     Pre-cache senior context + news at 5 AM (451 LOC)
│   ├── call_analysis.py     Post-call analysis via Gemini + call quality (246 LOC)
│   ├── interest_discovery.py Interest extraction from conversations (183 LOC)
│   ├── greetings.py         Sentiment-aware greeting templates + rotation (326 LOC)
│   ├── conversations.py     Conversation CRUD (250 LOC)
│   ├── daily_context.py     Same-day cross-call memory (161 LOC)
│   ├── seniors.py           Senior profile + per-senior call_settings (131 LOC)
│   ├── news.py              OpenAI cached news; in-call web_search uses Tavily first, OpenAI fallback (213 LOC)
│   ├── caregivers.py        Caregiver relationships + notes delivery (101 LOC)
│   ├── data_retention.py    HIPAA data retention: batched purge of 7 tables (configurable via env)
│   ├── audit.py             Fire-and-forget HIPAA audit logging (log_audit, auth_to_role)
│   └── token_revocation.py  JWT token revocation: per-token + per-admin + expired cleanup
│
├── lib/                 Shared utilities
│   ├── circuit_breaker.py   Async circuit breaker for external services (84 LOC)
│   ├── encryption.py        AES-256-GCM field-level PHI encryption (enc: prefix, graceful degradation)
│   ├── growthbook.py        GrowthBook Cloud SDK feature flags (99 LOC)
│   └── sanitize.py          PII masking for logs (38 LOC)
│
├── api/                 HTTP layer
│   ├── routes/voice.py      /voice/answer (TwiML + parallel fetch + snapshot), /voice/status (330 LOC)
│   ├── routes/calls.py      /api/call, /api/calls
│   ├── routes/auth.py       Token revocation: /api/admin/revoke-token, revoke-all, logout
│   ├── routes/export.py     HIPAA right-to-access: /api/seniors/{id}/export (full data bundle)
│   ├── routes/data.py       Data retention management endpoints
│   ├── middleware/           auth, api_auth, rate_limit, security, twilio, error_handler
│   └── validators/schemas.py  Pydantic request validation (142 LOC)
│
├── db/
│   ├── client.py            asyncpg pool + query helpers + health check (69 LOC)
│   └── migrations/          SQL migrations (HNSW, snapshots, audit_logs, revoked_tokens, encrypted_phi)
├── tests/               61 test files + helpers/mocks/scenarios
├── docs/ARCHITECTURE.md Full architecture docs
├── docs/LEARNINGS.md    Engineering learnings from production debugging
├── pyproject.toml       Python 3.12, dependencies
└── Dockerfile           python:3.12-slim + uv
```

**Service dependency graph** (most services only import `db`):
```
context_cache → seniors, conversations, memory, greetings, news  (orchestrator, persists cached news)
call_snapshot → conversations, daily_context                     (rebuilds snapshot post-call)
scheduler → memory, context_cache                           (needs context for calls)
memory, news → lib/circuit_breaker                          (external service resilience)
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

### `tests/e2e/` — Frontend E2E Tests (Playwright, 31 tests)

Browser tests for all 3 frontend apps. Mock API responses by default (no backend needed).

```
tests/e2e/
├── global.setup.ts              Clerk testing token initialization
├── fixtures/
│   ├── test-data.ts             Mock data (seniors, calls, reminders, etc.)
│   ├── auth.ts                  JWT auth helpers for admin/observability
│   └── api-mocks.ts             page.route() API mock setup functions
├── admin/                       Admin dashboard tests (17 tests)
│   ├── login.spec.ts            Login flow, error handling
│   ├── navigation.spec.ts       Sidebar navigation, responsive layout
│   ├── seniors.spec.ts          Senior list, create form
│   ├── calls.spec.ts            Call history, transcript modal
│   └── reminders.spec.ts        Reminder CRUD
├── consumer/                    Consumer app tests
│   ├── landing.spec.ts          Landing page, FAQ (public)
│   ├── dashboard.spec.ts        Protected route redirects (public)
│   └── authenticated/           Clerk-authenticated tests (5 tests)
│       ├── dashboard.spec.ts    Dashboard access, nav, sign out
│       └── onboarding.spec.ts   Onboarding flow access
├── observability/               Observability tests (4 tests)
│   ├── history.spec.ts          Call history, timeline
│   └── navigation.spec.ts       History/Live toggle, view switching
└── integration/                 Real API integration tests (excluded by default)
    └── admin-smoke.spec.ts      Smoke test against live admin app
```

Config: `playwright.config.ts` (root). Guide: [`docs/guides/FRONTEND_TESTING.md`](docs/guides/FRONTEND_TESTING.md).

### Root — Build & Deploy Tooling

```
/
├── Makefile                     Deploy commands: make deploy-dev, make test, etc.
├── scripts/
│   ├── setup-environments.sh    One-time setup: Neon branches + Railway dev env
│   └── create-admin.js          Admin user creation
├── .github/workflows/
│   ├── ci.yml                   PR pipeline: tests → staging deploy → smoke tests
│   └── deploy.yml               Production deploy on push to main
```

### Root Node.js — Admin APIs + Scheduler (Active)

Serves all API endpoints that frontends consume. Also runs the reminder scheduler.

```
/
├── index.js             Express server entry — CORS, middleware, GrowthBook, scheduler start
│
├── routes/              17 files — frontend-facing /api/* endpoints plus public health/waitlist
│   ├── calls.js         /api/call — initiate manual outbound call; Twilio webhooks point to Pipecat
│   ├── seniors.js       CRUD /api/seniors (126 LOC)
│   ├── reminders.js     CRUD /api/reminders + delivery tracking (127 LOC)
│   ├── observability.js Call monitoring endpoints (477 LOC)
│   ├── notifications.js Notification preferences, in-app notifications, service-triggered sends
│   ├── waitlist.js      Public /waitlist endpoint
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
├── services/            14 files — dual implementation with pipecat/services/
│   ├── scheduler.js     Active reminder polling + outbound calls (904 LOC)
│   ├── context-cache.js Pre-cache senior context (364 LOC)
│   ├── memory.js        Semantic memory, pgvector (336 LOC)
│   ├── call-analyses.js Post-call analysis API queries
│   ├── notifications.js Notification preferences + send helpers
│   ├── weekly-report.js Weekly caregiver report helpers
│   ├── greetings.js     Greeting templates (257 LOC)
│   ├── daily-context.js Cross-call memory (196 LOC)
│   ├── conversations.js Conversation CRUD (175 LOC)
│   ├── news.js          OpenAI cached news helper (103 LOC)
│   ├── caregivers.js    Caregiver relationships (90 LOC)
│   ├── seniors.js       Senior profiles (77 LOC)
│   ├── audit.js         Fire-and-forget HIPAA audit logging (logAudit, authToRole)
│   ├── token-revocation.js  JWT token revocation (per-token + per-admin + cleanup)
│   └── data-retention.js    HIPAA data retention purge (runDailyPurgeIfNeeded)
│
├── middleware/           6 files
│   ├── auth.js          Clerk + JWT mixed auth (198 LOC)
│   ├── validate.js      Zod request validation (164 LOC)
│   ├── rate-limit.js    5 rate limiter configs (98 LOC)
│   ├── api-auth.js      API key auth (55 LOC)
│   ├── security.js      Security headers (40 LOC)
│   └── error-handler.js Error formatting (33 LOC)
│
├── db/
│   ├── schema.js        Drizzle tables for seniors, reminders, notifications, waitlist, audit logs, etc.
│   ├── client.js        Neon PostgreSQL + Drizzle ORM init
│   └── setup-pgvector.js
│
├── validators/schemas.js  Zod validation schemas (291 LOC)
├── lib/                   logger.js, sanitize.js, encryption.js (AES-256-GCM PHI encryption)
└── tests/                 Node fixtures, helpers, mocks, and integration tests
```

**Dual implementations (by design):** Every `services/*.js` file has an equivalent `pipecat/services/*.py`. Both read/write the same database. This is intentional — each backend needs DB access for its own responsibilities. If you change DB schema or query logic, check both.

### `docs/` — Documentation

```
docs/
├── architecture/                 Architecture suite (current, authoritative)
│   (see also: pipecat/docs/LEARNINGS.md for engineering learnings)
│   ├── OVERVIEW.md               v5.3 high-level architecture
│   ├── ARCHITECTURE.md           System architecture reference
│   ├── FEATURES.md               Complete product feature inventory
│   ├── SECURITY.md               Authentication, validation, PII
│   ├── SCALABILITY.md            Admission control, pooling, Redis
│   ├── COST.md                   Per-call cost breakdown
│   ├── TESTING.md                3-level test architecture
│   └── PERFORMANCE.md            Latency, prefetch, circuit breakers
├── compliance/                   HIPAA compliance documentation
│   ├── HIPAA_OVERVIEW.md         Full HIPAA compliance status (safeguards, controls, gaps)
│   ├── BAA_TRACKER.md            16 vendor BAA status and tracking
│   ├── BREACH_NOTIFICATION.md    Incident response runbook + notification procedures
│   ├── DATA_RETENTION_POLICY.md  Retention schedule per table + purge procedures
│   └── VENDOR_SECURITY_EVALUATION.md  16 vendor security evaluations
├── plans/
│   ├── 2026-02-07-roadmap-and-feature-flags.md  Feature flag roadmap (future)
│   ├── 2026-02-05-multi-senior-management.md    Multi-senior management (future)
│   └── unsubscribed-caller                       Onboarding call flow design
└── decisions/
    ├── DONNA_ON_PIPECAT.md       Pipecat migration architecture (reference)
    └── VOICE_AI_FRAMEWORK_ANALYSIS.md  Framework comparison (reference)
```

---

## Architectural Patterns (Follow These)

1. **Lazy client init** — Services use `_client = None` + `_get_client()`. Never instantiate API clients at import time.

2. **Closure-based tool handlers** — `flows/tools.py` creates handlers via closure over `session_state` dict. This is how per-call state flows through Pipecat.

3. **In-memory caching** — `context_cache.py`, `news.py`, `scheduler.py` use module-level dicts. Per-process, lost on restart.

4. **Async everywhere** — All Python service functions are `async`. DB is `asyncpg`. Use `asyncio.create_task()` for fire-and-forget work.

5. **PII-safe logging** — Always use `lib/sanitize.py` when logging user data. Never log phone numbers or conversation content raw.

6. **Processors are pipeline-independent** — Quick Observer, Director, Tracker don't import services (except Director→director_llm). They process frames and pass them downstream.

7. **Fire-and-forget audit logging** — All PHI access is logged via `log_audit()` / `logAudit()`. Never awaited in the request path — uses `asyncio.create_task()` (Python) or unawaited `.then().catch()` (Node.js).

8. **Dual-column encryption** — PHI fields have `*_encrypted` companion columns. New writes encrypt to both. Reads prefer encrypted, fall back to plaintext. Gradual migration via backfill scripts.

9. **Dual-key JWT rotation** — `JWT_SECRET` + `JWT_SECRET_PREVIOUS` for zero-downtime credential rotation. Remove previous key after all old tokens expire (7 days).

---

## Large Files (Context Budget Warning)

Only load these when your task specifically requires them.

| File | LOC | Why it's big |
|---|---|---|
| `pipecat/processors/patterns.py` | 503 | 250+ regex patterns, 19 categories (pure data) |
| `pipecat/services/scheduler.py` | 529 | Pipecat-side scheduler helpers; Node scheduler is active |
| `pipecat/services/memory.py` | 494 | pgvector + HNSW + circuit breaker + mid-call refresh |
| `pipecat/processors/quick_observer.py` | 402 | Analysis logic + goodbye detection + model recs |
| `pipecat/services/director_llm.py` | 593 | Groq/Gemini Director prompts + response parsing |
| `pipecat/bot.py` | 542 | Pipeline assembly + sentiment greetings + call settings |
| `pipecat/services/greetings.py` | 326 | Sentiment-aware greeting templates + rotation |
| `pipecat/flows/nodes.py` | 554 | Subscriber + onboarding flow config and context builders |
| `pipecat/services/context_cache.py` | 451 | Pre-cache senior context at 5 AM |
| `pipecat/flows/tools.py` | 385 | 2 active Claude tool schemas + closure-based handlers |
| `pipecat/main.py` | 375 | FastAPI + graceful shutdown + enhanced /health |
| `services/scheduler.js` | 904 | Active Node.js reminder polling and call triggering |
| `services/context-cache.js` | 365 | Node.js context pre-caching |
| `routes/observability.js` | 477 | Call monitoring + metrics aggregation |

---

## Testing

```bash
# All tests (Python + Node.js)
make test

# Pipecat only (61 test files)
make test-python

# Regression scenario tests
make test-regression

# Node.js
npm test

# Frontend E2E tests (Playwright — all 3 apps, 31 tests)
npm run test:e2e                  # Full suite (~15s)
npm run test:e2e:admin            # Admin dashboard only
npm run test:e2e:consumer         # Consumer public + authenticated
npm run test:e2e:observability    # Observability dashboard only
npx playwright test --ui          # Interactive debug mode
```

Python test files follow `pipecat/tests/test_<module>.py` naming. Regression scenarios in `pipecat/tests/scenarios/`.

Frontend E2E tests are in `tests/e2e/` — see [`docs/guides/FRONTEND_TESTING.md`](docs/guides/FRONTEND_TESTING.md) for full guide.

---

## Deployment

Three environments: **dev** (experiments), **staging** (CI), **production** (customers). Each has its own Neon DB branch and Twilio number.

```bash
# Deploy to dev (your iteration environment)
make deploy-dev              # Both services
make deploy-dev-pipecat      # Just Pipecat (faster)

# Deploy to production
make deploy-prod             # Or push to main → auto-deploys via CI

# Health checks & logs
make health-dev
make logs-dev

# Admin dashboard (Vercel)
cd apps/admin-v2 && npx vercel --prod --yes

# First-time setup (creates Neon branches + Railway env vars)
make setup
```

Workflow: `edit → make deploy-dev-pipecat → call dev number → repeat`

---

*Source of truth for codebase navigation. Update when directories or responsibilities change. Last updated: April 2026 — v5.3 (HIPAA compliance)*
