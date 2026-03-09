# Plan: Speculative Director Pre-Processing with Cerebras

**Date**: 2026-03-04
**Status**: Implemented (pending deploy + real-call testing)
**Branch**: `feat/speculative-director-cerebras`

## Summary

Switch the Conversation Director from Gemini Flash to Cerebras (~3000 tok/s) as primary LLM, and add speculative analysis during silence gaps so guidance can be injected for the **current turn** instead of being one turn behind. Includes a pre-call warmup for turn-1 guidance.

**Key insight**: Between the user stopping speech and Claude starting its response, there's a ~700-1200ms window. By detecting silence at 250ms (via interim transcription gaps) and running Cerebras analysis (~70-100ms), the speculative result is ready before the final TranscriptionFrame arrives — enabling same-turn guidance injection.

---

## How It Works

```
Current (one turn behind):
  User speaks → 1.2s silence → Final TranscriptionFrame
                                  → inject PREVIOUS turn's guidance
                                  → start NEW analysis (for next turn)
                                  → pass frame to Claude

Proposed (same turn):
  User speaks → 250ms gap in interims → start Cerebras speculative analysis
                                          (~70-100ms, completes before final)
             → 1.2s silence → Final TranscriptionFrame
                                → speculative done? inject SAME-TURN guidance
                                → pass frame to Claude
```

## State Machine

```
LISTENING (default)
  InterimTranscription → store text, cancel old silence timer, start new 250ms timer
  TranscriptionFrame → check speculative result, inject guidance, pass frame

SILENCE_TIMER_PENDING (250ms timer running)
  InterimTranscription → cancel timer, cancel speculative if done → LISTENING
  Timer fires → start Cerebras analysis → SPECULATIVE_RUNNING
  TranscriptionFrame → cancel timer, inject previous guidance, start regular analysis

SPECULATIVE_RUNNING (Cerebras call in flight)
  InterimTranscription → cancel analysis, discard any result → LISTENING
  TranscriptionFrame:
    Speculative done + text matches → inject SAME-TURN guidance (win!)
    Speculative done + text diverged → discard, inject previous guidance
    Speculative not done → cancel, inject previous guidance, start regular analysis
```

---

## Files to Change

### 1. `pipecat/config.py` — Add env vars

Add to Settings dataclass + `_load_settings()`:
- `cerebras_api_key: str = ""` ← `CEREBRAS_API_KEY`
- `cerebras_director_model: str = "gpt-oss-120b"` ← `CEREBRAS_DIRECTOR_MODEL`

### 2. `pipecat/services/director_llm.py` — Cerebras client + refactor

**a) Extract `_build_turn_content()`** from `analyze_turn()` (lines 240-263) into standalone function. Both Cerebras and Gemini use the same turn content.

**b) Add Cerebras client:**
```python
from openai import AsyncOpenAI  # already in deps

_cerebras_client = AsyncOpenAI(
    api_key=os.environ["CEREBRAS_API_KEY"],
    base_url="https://api.cerebras.ai/v1",
)
```

**c) Two circuit breakers:**
- `_cerebras_breaker` — regular analysis (5s timeout, 3 failures, 60s recovery)
- `_cerebras_speculative_breaker` — speculative (3s timeout, 2 failures, 30s recovery)

Rationale: slow speculative calls shouldn't trip the breaker that gates regular analysis.

**d) New functions:**
- `_cerebras_analyze(turn_content, breaker)` — OpenAI chat.completions.create, reuse existing JSON repair logic
- `_gemini_analyze(turn_content)` — extracted from current `analyze_turn()`
- `analyze_turn_speculative(user_message, session_state, history)` — Cerebras-only, no Gemini fallback, uses speculative breaker. Returns None if Cerebras unavailable.
- `cerebras_available()` — checks if `CEREBRAS_API_KEY` is set
- `warmup_cerebras()` — sends a trivial request to warm TCP/TLS connection (for pre-call)

**e) Modify `analyze_turn()`:**
- If Cerebras available → try Cerebras primary, Gemini fallback
- If not → Gemini only (backward compatible)
- Log source ("cerebras" vs "gemini") for observability

### 3. `pipecat/processors/conversation_director.py` — Silence detection + speculative flow

**New instance state:**
```python
self._silence_timer_task: asyncio.Task | None = None
self._speculative_task: asyncio.Task | None = None
self._latest_interim_text: str = ""
# Metrics
self._speculative_attempts = 0
self._speculative_hits = 0
self._speculative_cancels = 0
```

**New constants:**
```python
SILENCE_ONSET_SECONDS = 0.250  # 250ms gap triggers speculative
SPECULATIVE_MIN_LENGTH = 15    # min chars in interim to trigger
```

**`process_frame()` on InterimTranscriptionFrame:**
1. Store `_latest_interim_text`
2. Cancel silence timer (user still speaking)
3. Cancel speculative task if running (new speech invalidates it)
4. If text >= 15 chars and Cerebras available → start new 250ms silence timer
5. Existing debounced prefetch (unchanged)
6. Push frame through

**`process_frame()` on TranscriptionFrame:**
1. Cancel silence timer
2. Check speculative task:
   - Done + result + Jaccard(interim, final) >= 0.7 → `speculative_result`
   - Done + text diverged → discard
   - Not done → cancel
3. Inject guidance:
   - If `speculative_result` → push `LLMMessagesAppendFrame` with same-turn guidance, store as `_last_result`, run `_take_actions()`, fire 2nd-wave prefetch
   - Else if `_last_result` → push previous-turn guidance (current behavior)
4. If speculative was NOT used → start regular `_pending_analysis` on final text
5. Fire prefetch, check memory refresh (unchanged)
6. Push frame through

**New methods:**
- `_cancel_silence_timer()` — cancel + None
- `_silence_timer(interim_text)` — `await asyncio.sleep(0.25)` then start speculative
- `_run_speculative_analysis(text, transcript)` — calls `analyze_turn_speculative()`, fires 2nd-wave prefetch on success
- `_text_matches(interim, final, threshold=0.7)` — Jaccard word overlap check

**Pre-call warmup (in `process_frame` on first TranscriptionFrame or via event):**
- On the very first frame (or on pipeline start), fire `asyncio.create_task(_warmup_cerebras())`
- Warms TCP/TLS connection so first speculative call is fast

**Turn 1 pre-call analysis:**
- When the call connects (before any user speech), run a Director analysis based on:
  - Senior profile, pending reminders, time of day, call type
  - User message: synthesized like "Call just started. Senior has not spoken yet."
- Store result as `_last_result` so turn 1 gets Director guidance
- This runs in parallel with the greeting (non-blocking)

**Metrics (on EndFrame):**
```
[Director] Call summary: 8 turns, 6/7 speculative hits (86%), 1 cancels
```

### 4. Tests

**`tests/test_director_llm.py`** — new tests:
- `_build_turn_content()` produces correct output
- `_cerebras_analyze()` returns None without API key
- `_cerebras_analyze()` parses valid JSON response
- `analyze_turn()` falls back from Cerebras to Gemini
- `analyze_turn_speculative()` returns None without Cerebras

**`tests/test_frame_conversation_director.py`** — new tests:
- Speculative result injected as same-turn guidance when ready
- Speculative cancelled when new interim arrives
- Speculative discarded when text diverges (Jaccard < 0.7)
- Falls back to previous guidance when speculative not ready
- Silence timer fires after 250ms of no interims
- No speculative when Cerebras not configured (backward compat)
- Pre-call analysis provides turn-1 guidance

### 5. Documentation

- **CLAUDE.md**: Add Cerebras to working features, add env vars, update pipeline diagram
- **pipecat/docs/ARCHITECTURE.md**: Add "Speculative Pre-Processing" section with state machine

---

## What Does NOT Change

- Quick Observer (Layer 1) — unchanged, still sync regex
- Pipeline order — unchanged, Director is still in same position
- Prefetch system — unchanged, speculative just adds a new trigger
- Post-call processing — unchanged
- Memory system — unchanged
- Backward compatibility — if `CEREBRAS_API_KEY` not set, everything works exactly as today

## Implementation Order

1. `config.py` — add env vars (no deps)
2. `director_llm.py` — extract helpers, add Cerebras client/functions, add warmup (depends on config)
3. `conversation_director.py` — add state machine, pre-call analysis (depends on director_llm exports)
4. Tests — unit + integration
5. Documentation

## Future Enhancements (not in this plan)

- **Adaptive VAD timing** — Track senior's speech patterns, dynamically adjust the effective response delay (min floor 1.0s). Builds on the silence detection infrastructure added here.
- **Cerebras for post-call analysis** — Speed up post-call pipeline too.

## Verification

1. `cd pipecat && uv run python -m pytest tests/` — all tests pass
2. Set `CEREBRAS_API_KEY` in Railway dev env
3. `make deploy-dev-pipecat`
4. Call dev number (+19789235477), watch logs for:
   - `[Director] Pre-call analysis complete` — turn 1 guidance ready
   - `[Director] Speculative analysis started` — silence detected
   - `[Director] SAME-TURN guidance injected` — speculative hit
   - `[Director] Call summary: X/Y speculative hits` — hit rate
5. Target: >50% speculative hit rate = success
