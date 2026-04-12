# Donna Pipecat Debug Hotspots

Use this file after classifying the symptom. It is a fast map from failure mode to likely edit/debug surfaces.

## Call Setup And Twilio Entry

- `pipecat/api/routes/voice.py`: active TwiML answer path, call bootstrap, snapshot/context loading
- `pipecat/main.py`: `/ws`, session setup, graceful shutdown
- `pipecat/bot.py`: pipeline assembly, per-call session state, provider wiring
- `routes/voice.js`: Node-side TwiML/call initiation path still relevant for frontend-triggered flows
- `pipecat/api/middleware/twilio.py` and `middleware/twilio.js`: signature validation issues

Symptoms:

- call never connects
- Twilio callback failures
- wrong senior loaded
- wrong environment/service answering

## STT, Turn Taking, And Goodbye

- `pipecat/bot.py`: VAD/STT/TTS wiring
- `pipecat/processors/quick_observer.py`: instant guidance, goodbye, health/emotion pattern handling
- `pipecat/processors/patterns.py`: regex patterns and categories
- `pipecat/processors/goodbye_gate.py`: inactive path, useful for historical context only

Symptoms:

- senior gets cut off
- goodbye not ending call
- false goodbye
- health/emotion signals ignored

## Director, Guidance, Memory, And Search

- `pipecat/processors/conversation_director.py`: orchestration, gating, ephemeral context, fallback actions
- `pipecat/services/director_llm.py`: Query Director and Guidance Director prompts/parsing
- `pipecat/services/prefetch.py`: speculative memory/web prefetch behavior
- `pipecat/services/memory.py`: semantic memory retrieval/store
- `pipecat/services/news.py`: web/news retrieval path
- `pipecat/flows/tools.py`: remaining LLM tools and handlers

Symptoms:

- stale or conflicting guidance
- latency regressions mid-call
- memories not appearing
- search triggers at the wrong time
- filler TTS or gated release behaving incorrectly

## Post-Call And Context Rebuild

- `pipecat/services/post_call.py`: orchestration after disconnect
- `pipecat/services/call_analysis.py`: summary, concerns, quality scoring
- `pipecat/services/interest_discovery.py`: interest extraction
- `pipecat/services/call_snapshot.py`: next-call snapshot rebuild
- `pipecat/services/daily_context.py`: same-day cross-call context
- `pipecat/services/conversations.py`: persistence and read paths

Symptoms:

- summaries missing
- caregiver notifications missing
- memories not saved after call
- next call missing previous context

## Reminders And Scheduler

- `pipecat/services/scheduler.py`
- `pipecat/services/reminder_delivery.py`
- `services/scheduler.js`
- `routes/reminders.js`
- `routes/calls.js`

Symptoms:

- duplicate reminder calls
- reminders not acknowledged
- wrong delivery timing
- manual call initiation issues

Check scheduler ownership before editing. Donna has architecture notes about Node-vs-Pipecat scheduler responsibility.

## Security, Compliance, And Data Handling

- `pipecat/api/middleware/`
- `middleware/`
- `pipecat/lib/encryption.py` and `lib/encryption.js`
- `pipecat/services/audit.py` and `services/audit.js`
- `pipecat/services/token_revocation.py` and `services/token-revocation.js`
- `pipecat/services/data_retention.py` and `services/data-retention.js`

Symptoms:

- auth mismatch across services
- PHI exposed in logs or responses
- export/delete/retention gaps
- token revocation or logout inconsistencies

## Useful Validation Loops

- Fast local Python pass: `make test-python`
- Regression scenarios: `make test-regression`
- Targeted Pytest: `cd pipecat && uv run python -m pytest tests/test_<module>.py -q`
- Node API pass: `npm test`
- Frontend behavior pass: `npm run test:e2e:admin`, `npm run test:e2e:consumer`, `npm run test:e2e:observability`
- Live dev verification: `make deploy-dev-pipecat`, then `make logs-dev`

## Known Gotchas

- The Director must remain non-blocking.
- Programmatic goodbye is intentional.
- Frontends talk to Node APIs, not Pipecat directly.
- Docs contain historical states; check the current code before trusting narrative docs.
- Railway service targeting depends on the command and working directory.
