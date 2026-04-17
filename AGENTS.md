# Donna Codex Guide

Read `DIRECTORY.md` before writing code. It is the navigation map for active vs. legacy code and the canonical "where do I edit this?" reference.

## Core Architecture

- Donna has two active backends.
- `pipecat/` owns the real-time voice pipeline, Telnyx WebSocket path, call behavior, post-call processing, and Python API routes.
- Repo-root Node/Express owns the frontend-facing `/api/*` routes, admin/consumer APIs, and the active scheduler.
- Frontends do not call Pipecat directly. `apps/admin-v2`, `apps/consumer`, `apps/mobile`, and `apps/observability` should be treated as Node API clients.
- Do not confuse `services/*.js` with `pipecat/services/*.py`. They are separate implementations over the same database.

## Active Surfaces

- Voice behavior, prompts, flow nodes, tools, Director, Quick Observer, and post-call logic: `pipecat/`
- Frontend APIs, auth routes, and scheduler: repo root
- Primary admin UI: `apps/admin-v2/`
- Caregiver-facing web UI: `apps/consumer/`
- Mobile app: `apps/mobile/`
- Docs and compliance references: `docs/`

## Hard Project Rules

- Treat transcripts, reminders, medical notes, summaries, memories, and caregiver-linked senior data as PHI.
- Never introduce raw PHI into logs, test fixtures, screenshots, or debug output.
- Preserve existing auth, audit logging, encryption, token revocation, and data retention behavior unless the task explicitly changes them.
- If you change shared security/compliance behavior, inspect both Python and Node implementations for parity:
  - auth
  - audit logging
  - token revocation
  - data retention
  - encryption
- If docs and code disagree, trust runtime code first and call out the mismatch.

## Voice Pipeline Invariants

- Keep the Conversation Director non-blocking. Do not move per-turn analysis onto the critical path.
- Keep programmatic goodbye handling in the Quick Observer path. Do not reintroduce LLM-only call-ending logic.
- Preserve ephemeral context stripping. Do not let Director injections accumulate across turns.
- Remember the active scheduler assumption: the Node backend is the authoritative scheduler unless the task explicitly changes that architecture.
- Deploy Pipecat from `pipecat/`-aware commands. Do not assume repo-root Railway commands target the Python service.

## Workflow

1. Read `DIRECTORY.md`.
2. Identify the target surface before editing: `pipecat`, repo-root Node, frontend app, or docs.
3. Read only the relevant docs:
   - architecture: `docs/architecture/`
   - compliance: `docs/compliance/`
   - Pipecat debugging/latency lessons: `pipecat/docs/LEARNINGS.md`
4. Validate at the smallest useful level first.
5. Use Railway dev deploys only when the bug depends on live Telnyx, live audio, or environment wiring.

## Validation

- Full local tests: `make test`
- Pipecat tests: `make test-python`
- Regression scenarios: `make test-regression`
- Node tests: `npm test`
- Frontend E2E: `npm run test:e2e`
- App-specific E2E:
  - `npm run test:e2e:admin`
  - `npm run test:e2e:consumer`
  - `npm run test:e2e:observability`
- Pipecat dev deploy: `make deploy-dev-pipecat`
- Combined dev deploy: `make deploy-dev`

## Canonical Edit Paths

- Change Donna's voice behavior: `pipecat/prompts.py`, `pipecat/flows/nodes.py`, `pipecat/flows/tools.py`
- Change Quick Observer: `pipecat/processors/patterns.py`, `pipecat/processors/quick_observer.py`
- Change Director behavior: `pipecat/processors/conversation_director.py`, `pipecat/services/director_llm.py`
- Change post-call behavior: `pipecat/services/post_call.py`
- Change semantic memory or prefetch: `pipecat/services/memory.py`, `pipecat/services/prefetch.py`
- Change Telnyx webhook/outbound path: `pipecat/api/routes/telnyx.py`, `pipecat/api/routes/call_context.py`
- Change frontend/manual call initiation: `routes/calls.js` (Node asks Pipecat to create a Telnyx call)
- Change frontend APIs: `routes/*.js`, `middleware/*.js`, `validators/schemas.js`
- Change admin UI: `apps/admin-v2/src/`
- Change caregiver web UI: `apps/consumer/src/`
- Change mobile UI: `apps/mobile/`

## Repo-Local Skills

Donna-specific Codex skills live under `.codex/skills/`:

- `accessibility-audit`
- `privacy-audit`
- `senior-ux-review`
- `donna-pipecat-debug`

Use them when the task is explicitly an audit/review or a Pipecat debugging investigation.
