# Donna Voice Pipeline — Engineering Learnings

Hard-won lessons from building and optimizing the real-time voice pipeline. Each learning comes from production debugging, live call testing, or architectural iteration. Verified against the current codebase (March 2026).

---

## Pipeline Architecture

### LLM Tool Calls Are Unreliable for Critical Actions
Claude says "goodbye" in text but inconsistently calls the `transition_to_winding_down` tool. The call stays open and the senior hears silence. **Solution:** Quick Observer detects goodbye via regex (0ms) and injects `EndFrame` programmatically after a 2s delay. Never rely on Claude tool calls for call-ending logic.

### Non-Blocking Director Is Essential
The Conversation Director must NEVER block the pipeline. It passes frames through instantly and runs analysis in `asyncio.create_task()`. A blocking Director would add 200-700ms to every turn. The tradeoff: guidance is injected same-turn (via speculative) or previous-turn (fallback), never synchronously.

### Two-Director Split: Query vs Guidance
A single Director prompt doing everything (query extraction + guidance + phase detection + reminders) costs ~700ms. Splitting into two specialized calls halves the latency on the critical path:
- **Query Director** (~200ms): Extracts `memory_queries` + `web_queries` only. Fires continuously on interims.
- **Guidance Director** (~400ms): Conversation guidance, phase, reminders. Fires on silence-based speculative only.

The key insight: query extraction needs to happen mid-speech for web search gating. Guidance can wait until a natural pause.

### Regular Analysis on Final Transcription Is Redundant
The silence-based speculative already runs full guidance analysis during the 250ms pause before the final transcription arrives. Running another analysis on the final text doesn't help the current turn (Claude already started responding) and only marginally helps the next turn. Removing it simplifies the architecture with no quality loss.

### Ephemeral Context Prevents Prompt Bloat
All Director-injected messages (guidance, memories, web results) are tagged with `[EPHEMERAL:` prefix and stripped before each new turn. Without this, the LLM context grows linearly — each turn adds ~200 tokens of guidance that never gets cleaned up. Ephemeral stripping keeps the context stable and prompt caching effective.

### Guidance Message Conflicts Between Layers
Quick Observer (Layer 1) and Director (Layer 2) can inject contradictory guidance. Example: Quick Observer detects goodbye and injects `[GOODBYE]`, but Director's stale cached analysis injects `[RE-ENGAGE]`. **Solution:** `_goodbye_in_progress` flag in `session_state` suppresses Director guidance during goodbye transitions. Layer 1 always takes priority over Layer 2.

---

## Web Search

### Regex-Based Question Detection Fails on Conversational Speech
Detecting factual questions via `?` character or regex patterns triggers on conversational speech: "How much? I'm about to..." and "from India. Remember?" both fired false web searches. Blocklist approaches (listing social questions to skip) can't cover all cases. **Solution:** Let the Query Director (Groq LLM) decide — it understands conversational context and only returns `web_queries` for genuine factual questions.

### Web Search Caching Causes More Harm Than Good
Caching web search results to prevent duplicate API calls seems smart but is dangerous: one wrong answer from Tavily poisons all subsequent similar queries for the entire call. The containment-matching algorithm also caused cross-topic false matches ("2026" appearing in both "Orlando Magic score 2026" and "Austin weather 2026"). **Decision:** Remove web search caching entirely. The in-flight dedup (`if task not done: return`) prevents rapid-fire duplicates without caching stale results.

### Query Similarity Is Harder Than It Looks
Simple word overlap fails on shared generic tokens (years, dates). TF-IDF requires dependencies. Embeddings are too slow (<5ms budget). **Best approach for short queries:** Noise word removal + lemmatization + containment/Jaccard hybrid + bigram bonus. Zero dependencies, <0.1ms. Kept as a utility (`query_similarity()` in `conversation_director.py`) even though web search caching was removed — useful for future dedup needs.

### Web Search Gating Timeline
The ideal flow: Query Director detects a factual question mid-speech → starts web search → final transcription arrives → search already in-flight → filler TTS plays → result injected → Claude responds with answer. This saves ~4.3s vs Claude calling the `web_search` tool (two LLM round trips). The gating only works if the Query Director completes before the final transcription, which requires the continuous speculative to fire early enough.

---

## Speculative Pre-Processing

### Continuous Speculative Window Tuning
Too aggressive (20 chars) → fires on useless fragments like "Not much. How are you". Too conservative (50+ chars) → misses questions entirely. **Current settings:**
- First fire: 45 chars (~8-9 words, enough for "Do you know what the weather is like tomorrow")
- Re-fires: 60+ total chars AND 25 new chars since last fire
- Interval: 500ms minimum between fires

### Silence-Based Speculative Still Needed
The continuous speculative (interims) handles query extraction mid-speech. But for same-turn guidance injection, the silence-based speculative (250ms pause) is essential — it fires the full Guidance Director analysis close to when the user finishes speaking, giving the best chance of a speculative hit at harvest time.

### Speculative Results Build Cache Even on Miss
Completed speculative analyses that don't match the final transcription text still contribute: their memory prefetch results populate the cache, and their `_last_result` serves as previous-turn guidance. Don't cancel running speculatives — let them complete.

---

## Latency Optimization

### Every Claude Tool Call Costs ~4.3 Seconds
Two sequential LLM round trips: one to generate the tool call, one to generate the response after seeing the result. This is the single biggest latency penalty. **Eliminated tools:**
- `search_memories` → Director injects memories as ephemeral context (500ms gate)
- `save_important_detail` → Removed; post-call `extract_from_conversation` handles it
- `check_caregiver_notes` → Pre-fetched at call start, injected into system prompt

### Fire-and-Forget for Non-Critical DB Writes
`mark_reminder_acknowledged` handler returns immediately with a success response. The actual DB write runs in `asyncio.create_task()`. Claude gets its response instantly; the database update happens in the background. Same pattern used for marking caregiver notes as delivered.

### Memory Gate: 500ms Wait Saves 4.3s
Before passing the final transcription to Claude, wait up to 500ms for the memory prefetch cache to populate. The prefetch started on interim transcriptions while the user was still speaking — most of the time it's already cached. Worst case: 500ms delay. Best case: 0ms (cache hit). Compared to Claude calling `search_memories` tool: ~4.3s saved.

### Prompt Shortening Directly Reduces Latency
The Guidance Director prompt went from ~200 tokens (everything) to ~130 tokens (guidance only). Query Director prompt is ~60 tokens. Shorter prompts = less prefill time = faster Groq responses. The split also reduces output tokens (150 max for queries vs 500 for full analysis).

---

## Pipecat Framework (v0.0.101)

### Do NOT Replace OpenAILLMContext with LLMContext
`AnthropicLLMService.create_context_aggregator()` calls `set_llm_adapter()` which only exists on `OpenAILLMContext`. Using the generic `LLMContext` causes an instant crash with no error logs. This is a Pipecat v0.0.101 limitation — revisit when the Anthropic adapter is updated.

### Cartesia TTS Must Output PCM
Cartesia with `pcm_mulaw` encoding causes garbled Twilio audio — Pipecat's `TwilioFrameSerializer` assumes all `TTSAudioRawFrame` data is PCM and re-encodes to mulaw. Double-encoding = garbled. Always output PCM from TTS; let the serializer handle mulaw conversion. Current code relies on Cartesia SDK defaults (which output PCM).

### VAD Settings for Elderly Speech
Elderly speakers have longer pauses, softer voices, and slower speech. Default Silero VAD settings cut them off. **Tuned settings:** `confidence=0.6` (lower sensitivity), `stop_secs=1.2` (longer pause tolerance), `min_volume=0.5` (accommodate softer voices).

### Import Pipeline Modules at Startup
Importing `run_bot` inside the WebSocket handler (lazy import) causes a 17-second cold start on the first call due to Pipecat module loading. Import at the top of `main.py` instead.

---

## Deployment & Operations

### Railway Environments Are NOT Git Branches
`make deploy-dev` uploads your current working directory to the dev Railway environment regardless of which git branch you're on. The only automated git→deploy connections: PR to main → staging, push to main → production.

### Always Deploy Pipecat from the Correct Directory
Railway CLI in `donna2/` (repo root) is linked to `donna-api` (Node.js). Railway CLI in `donna2-pipecat/pipecat/` is linked to `donna-pipecat` (Python). Deploying from the wrong directory sends the wrong codebase to the wrong service.

### asyncpg Returns UUID Objects
Always `str(senior_id)` before string operations (slicing, logging, comparison). asyncpg returns Python `UUID` objects, not strings. This causes silent failures in string comparisons and dict lookups.

### Scheduler Conflict Prevention
Only one scheduler instance should run across all environments. Set `SCHEDULER_ENABLED=false` in Pipecat — the Node.js backend runs the scheduler. Two active schedulers = double reminder calls.

---

## Testing

### Mock Both Directors in Tests
Tests that run the pipeline need to mock both `analyze_turn_speculative` (Guidance Director, silence-based) and `analyze_queries` (Query Director, continuous). Mocking only one leaves the other making real Groq API calls. Pre-set `processor._last_result` to simulate previous-turn guidance when testing guidance injection.

### Regression Tests Need Pre-Set Guidance State
Tests that verify Director actions (force end at 12 minutes, force winding-down at 9 minutes) depend on `_take_actions()` being called, which only happens during guidance injection. Without the regular analysis path (removed), tests must pre-set `_last_result` on the Director processor so previous-turn guidance triggers actions.

---

*Last updated: March 2026 — Split Director architecture, ephemeral context, web search gating*
