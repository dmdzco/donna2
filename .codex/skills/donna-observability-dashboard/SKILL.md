---
name: donna-observability-dashboard
description: Debug, change, validate, or redesign Donna's internal observability dashboard. Use when working on `apps/observability`, `/api/observability/*`, live/dev/prod dashboard data switching, call history/timeline/observer/metrics panels, PHI-safe dashboard click-through testing, or voice-pipeline transcript/metrics data feeding observability.
---

# Donna Observability Dashboard

Use this skill for Donna's internal call monitoring dashboard and its Node/Pipecat data sources.

## First Steps

1. Read `DIRECTORY.md`.
2. Identify the surface:
   - UI: `apps/observability/src/`
   - Node API: `routes/observability.js`, `services/call-analyses.js`
   - transcript source: `pipecat/processors/conversation_tracker.py`
   - call metrics/context trace source: `pipecat/services/post_call.py`, `pipecat/services/context_trace.py`
3. Keep all testing PHI-safe. Do not print transcript, summary, medical notes, caregiver notes, phone numbers, or full names unless the user explicitly asks for specific content.

## Local Dev Setup

Run the dashboard at the canonical local URL:

```bash
npm --prefix apps/observability run dev -- --host localhost --port 3002
```

Use `http://localhost:3002/`, not `127.0.0.1` or random Vite ports. The dashboard's Vite proxy expects localhost and routes:

- `/dev-api` -> Railway dev API
- `/prod-api` -> Railway prod API

If the shared Playwright web server fails because another app lacks dependencies, install that app's package dependencies rather than changing observability code:

```bash
npm --prefix apps/admin-v2 install
npm --prefix apps/consumer install
```

## Testing Unpushed Node API Changes

If `routes/observability.js` changed and the user wants to test before deployment, run a local Node API against Railway dev env with the scheduler disabled:

```bash
railway run --service donna-api --environment dev -- bash -lc \
  'unset RAILWAY_PUBLIC_DOMAIN; ENVIRONMENT=development SCHEDULER_ENABLED=false PORT=3001 node index.js'
```

Then run observability pointed at local Node:

```bash
VITE_API_URL_DEV=http://localhost:3001 npm --prefix apps/observability run dev -- --host localhost --port 3002
```

Never leave the scheduler enabled in this local API mode.

## Validation

Minimum checks for UI-only changes:

```bash
npm --prefix apps/observability run build
npm run test:e2e:observability
git diff --check
```

When changing `/api/observability/*` or XSS/PHI rendering:

```bash
npm test -- --run tests/integration/routes/frontend-xss-guardrail.test.js
```

When changing transcript capture or timeline data from Pipecat:

```bash
cd pipecat && uv run python -m pytest tests/test_frame_conversation_tracker.py tests/test_conversations.py
```

## PHI-Safe Click-Through

Prefer browser automation that reports shape/status, not content.

1. Generate a short-lived dev/prod JWT inside Railway env when needed.
2. Inject it into localStorage:
   - `donna_obs_environment=dev`
   - `donna_obs_token_dev=<token>`
   - `donna_obs_token_prod=<token>`
3. Click first 10-20 calls through Analysis, Timeline, Observer, Metrics.
4. Capture only:
   - visible/error/empty state flags
   - console errors
   - request failures
   - event counts and timestamp offsets

Do not screenshot or paste transcript bodies unless the user explicitly asks.

## Known Pitfalls

- Analysis uses the call-list response and can work while Timeline/Observer/Metrics fail, because those tabs call separate endpoints.
- Old transcripts may lack `sequence`, `timestamp`, and `timestamp_offset_ms`. The dashboard should show estimated offsets rather than all `0:00`.
- Existing old calls may already be stored in grouped speaker order. Do not claim exact interleaving can be recovered if it was never stored.
- Future calls should store transcript turns with `sequence`, `timestamp`, and `timestamp_offset_ms`; assistant turns should flush at LLM response end.
- Observer often has no per-turn observer signals. The panel should fall back to post-call analysis: sentiment, mood, engagement, concerns, caregiver takeaways, follow-ups, and call quality.
- Metrics often has no token usage or cost. The panel should still show infrastructure metrics: duration, turns, end reason, error count, LLM/TTS latency, tools used, and breaker states.
- Do not expose raw "phase durations" as the primary debugging view. Operators need the Context tab: system/task prompt sections, last-call summary context, memory injections, web search/tool results, providers, timestamps, and latency.
- LLM context trace content can include PHI. It must be written to encrypted storage (`context_trace_encrypted`) and returned only through authenticated observability APIs.
- If login shows browser-level `Failed to fetch`, check local URL/proxy/CORS before debugging credentials. Bad credentials should return a normal API error, not a fetch failure.

## Design Guidance

Keep this dashboard internal and operational:

- Prefer clear status, data freshness, and failure states over decorative UI.
- Keep touch targets at least 44px and preserve visible focus states.
- Do not expose service API keys, cofounder keys, or JWT secrets in frontend config.
- Keep dev/prod tokens separate in localStorage.
- If a panel receives malformed data, render a bounded error state instead of crashing the whole app.
