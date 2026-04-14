---
name: donna-pipecat-debug
description: Debug Donna's Python voice pipeline and surrounding Twilio/Node integration. Use when investigating call setup failures, STT/TTS issues, latency regressions, Director guidance bugs, reminder delivery issues, web search/memory oddities, post-call failures, scheduler conflicts, or any bug crossing `pipecat/` and the repo-root services.
---

# Donna Pipecat Debug

Start by classifying the bug before reading large files. Use `references/hotspots.md` for the symptom-to-file map.

## Workflow

1. Read `DIRECTORY.md`.
2. Classify the failure:
   - call setup / Twilio answer path
   - live pipeline behavior
   - memory or web search behavior
   - reminder delivery or scheduler
   - post-call processing
   - frontend/API mismatch
3. Read the minimal relevant docs:
   - `pipecat/docs/LEARNINGS.md`
   - `pipecat/docs/ARCHITECTURE.md`
   - `docs/architecture/PERFORMANCE.md`
4. Inspect only the active files for that symptom.
5. Preserve the known pipeline invariants listed below.
6. Validate with the smallest useful loop first, then escalate to Railway dev deploy only if the bug depends on live audio or Twilio wiring.

## Pipeline Invariants

- Quick Observer owns critical goodbye handling. Do not move call ending back to unreliable LLM tool calls.
- Conversation Director must stay non-blocking.
- Ephemeral context must be stripped each turn.
- Frontends call the Node API, not Pipecat directly.
- Security-sensitive behavior may require matching changes in both Python and Node implementations.
- Scheduler ownership is architectural, not accidental. Confirm whether the task is changing the active scheduler before moving logic.

## Validation

- `make test-python`
- `make test-regression`
- targeted `uv run python -m pytest ...`
- `npm test` when Node or shared API behavior changed
- `npm run test:e2e:*` for frontend regressions
- `make deploy-dev-pipecat` only when runtime confirmation is needed

## Railway Log Hygiene

- Use `LOG_LEVEL=INFO` for Railway dev/staging/prod validation unless a short-lived incident requires `DEBUG`.
- Do not leave Pipecat `DEBUG` enabled in shared Railway environments after a live call. Debug logs can include LLM prompt context, transcripts, caregiver notes, medical notes, raw Twilio WebSocket parameters, and one-time `ws_token` values.
- After live Twilio smoke tests, scan Pipecat logs for sensitive payloads as part of the verification, not only call success or latency.
- If you need debug-level details, capture only the narrow time window, avoid copying PHI into notes, and remove or redact sensitive log excerpts from any durable artifact.

## Output

- Identify the failing subsystem first.
- Present root cause or strongest hypothesis with file references.
- Call out risks to latency, call quality, or PHI handling.
- If the issue depends on live infrastructure you could not verify locally, say so plainly.
