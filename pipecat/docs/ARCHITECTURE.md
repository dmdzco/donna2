# Donna Pipecat — Architecture Overview

> Python Pipecat port of Donna's voice pipeline, running in parallel with the existing Node.js stack.

## High-Level Architecture

```
                     ┌──────────────────────────────────────┐
                     │          Twilio Voice Call            │
                     └─────────────┬────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │     /voice/answer (TwiML)    │
                    │   Fetches senior context,     │
                    │   creates conversation,       │
                    │   returns <Stream url="/ws">  │
                    └──────────────┬───────────────┘
                                   │ WebSocket
                    ┌──────────────▼──────────────┐
                    │        main.py /ws            │
                    │   Accepts WS, creates         │
                    │   session_state, calls bot.py  │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │        Pipecat Pipeline       │
                    │        (see below)            │
                    └──────────────────────────────┘
```

## Pipecat Pipeline (bot.py)

Linear pipeline of `FrameProcessor`s. The Conversation Director sits in the pipeline but is **non-blocking** — it passes frames through instantly while running Gemini analysis in a background `asyncio.create_task()`.

```
Twilio Audio ──► FastAPIWebsocketTransport
                        │
                        ▼
                ┌───────────────┐
                │  Deepgram STT  │  (Speech-to-Text, Nova 3)
                └───────┬───────┘
                        │ TranscriptionFrame
                        ▼
              ┌─────────────────────┐
              │   Quick Observer     │  Layer 1: Instant regex (0ms)
              │   (BLOCKING)         │  → 268 patterns: health, goodbye,
              │   (268 patterns)     │    emotion, cognitive, activity
              │                      │  → Injects guidance for THIS turn
              │   Goodbye detected → │  → EndFrame after 2s delay
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐     ┌──────────────────────────┐
              │ Conversation         │     │  Background Analysis      │
              │ Director             │────►│  (asyncio.create_task)    │
              │ (PASS-THROUGH)       │     │                           │
              │                      │     │  Groq/Cerebras (~70ms)    │
              │ 1. Injects guidance  │     │  Gemini fallback (~150ms) │
              │    (same-turn via    │     │  Result cached → injected │
              │    speculative, or   │     │  on NEXT turn (or same    │
              │    previous-turn)    │     │  via speculative)         │
              │ 2. Injects news when │     │                           │
              │    Director signals  │     │  Also handles:            │
              │ 3. Passes frame      │     │  • Predictive prefetch    │
              │    immediately       │     │    (2 waves + interim)    │
              │ 4. Fires background  │     │  • Director-owned web     │
              │    analysis ────────►│     │    search (filler + gate) │
              │ 5. Web search gate:  │     │  • Mid-call memory refresh│
              │    holds frame if    │     │    (after 5+ min)         │
              │    search in-flight, │     │  • Force winding-down 9min│
              │    pushes filler TTS │     │                           │
              └─────────┬───────────┘     └──────────────────────────┘
                        │ (no delay)
                        ▼
              ┌─────────────────────┐
              │  Context Aggregator  │  Builds LLM context from
              │  (user side)         │  transcription frames
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │   Anthropic LLM      │  Claude Sonnet 4.5 (streaming)
              │   + Flow Manager     │  4 tools, 3-phase state machine
              └─────────┬───────────┘
                        │ TextFrame
                        ▼
              ┌─────────────────────┐
              │ Conversation Tracker │  Tracks topics, questions,
              │                      │  advice per call. Shares
              │                      │  transcript via session_state
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │  Guidance Stripper   │  Removes <guidance>...</guidance>
              │                      │  tags and [BRACKETED] directives
              │                      │  before TTS
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │   ElevenLabs TTS     │  Text-to-Speech (streaming)
              └─────────┬───────────┘
                        │ AudioFrame
                        ▼
              FastAPIWebsocketTransport ──► Twilio Audio
                        │
                        ▼
              ┌─────────────────────┐
              │  Context Aggregator  │  Tracks assistant responses
              │  (assistant side)    │  for conversation history
              └─────────────────────┘
```

## How Pipeline Components Communicate

The pipeline processors don't call each other directly. They communicate through two mechanisms:

1. **Frame injection** — Quick Observer and Conversation Director inject guidance into the LLM context by pushing `LLMMessagesAppendFrame` frames. These get appended to Claude's message history before it generates a response, but they don't trigger an LLM call on their own (`run_llm=False`). The next `TranscriptionFrame` reaching the Context Aggregator triggers the actual LLM call, at which point all injected guidance is already in context.

2. **Shared `session_state` dict** — A mutable dictionary initialized in `main.py` and passed to every processor. Key shared state:
   - `_transcript` — Rolling conversation history (max 40 turns), written by ConversationTracker, read by ConversationDirector for its Gemini analysis
   - `_goodbye_in_progress` — Set by QuickObserver when strong goodbye detected, read by Director to suppress stale guidance injection
   - `_call_start_time` — Set in bot.py, read by Director for time-based fallbacks
   - `_conversation_tracker` — Reference to the ConversationTracker processor, read by Flow nodes to build tracking summaries
   - `_prefetch_cache` — `PrefetchCache` instance, written by Director prefetch, read by `search_memories` tool handler
   - `_news_injected` — Boolean flag, set by Director after injecting news context (one-shot per call)
   - `news_context` — Pre-fetched news string, read by Director for dynamic injection when `should_mention_news` is true
   - `_last_quick_analysis` — `AnalysisResult` from Quick Observer, read by prefetch engine for family/health/activity signals

3. **Pipeline task reference** — Both QuickObserver and Director receive a `set_pipeline_task(task)` call after pipeline creation. This lets them queue `EndFrame` directly to force call termination, bypassing the normal frame flow.

---

## 2-Layer Observer Architecture

### Layer 1: Quick Observer (0ms)

Instant regex-based analysis with 268 patterns across 19 categories:

| Category | Patterns | Effect |
|----------|----------|--------|
| **Health** | 30+ patterns (pain, falls, medication, symptoms) | Health signals in context |
| **Emotion** | 25+ patterns with valence/intensity | Emotional tone detection |
| **Family** | 25+ relationship patterns including pets | Context enrichment |
| **Safety** | Scams, strangers, emergencies | Safety concern flags |
| **Engagement** | Response length analysis | Engagement level tracking |
| **Goodbye** | Strong/weak goodbye detection | **EndFrame after 2s delay** |
| **Factual/Curiosity** | 18 patterns ("what year", "how tall") | Web search trigger |
| **Cognitive** | Confusion, repetition, time disorientation | Cognitive signals |

**Guidance injection**: When patterns match, Quick Observer builds a guidance string (e.g., `[HEALTH] They mentioned pain. Ask how they are feeling.`) and pushes it as an `LLMMessagesAppendFrame` with `run_llm=False`. This appends a user-role message to Claude's context before the next LLM call, steering the response without adding latency.

**Model recommendations**: Quick Observer also generates token budget recommendations based on signal priority (16 ordered rules). Crisis situations get 350 tokens; simple questions get 100. This data is available on the `AnalysisResult` but is not currently consumed by the pipeline — it's designed for future dynamic token routing.

**Programmatic Goodbye**: When a strong goodbye signal is detected (e.g., "goodbye", "talk to you later"), Quick Observer schedules an `EndFrame` after 2 seconds via the pipeline task reference. This bypasses unreliable LLM tool-calling for call termination. It also sets `session_state["_goodbye_in_progress"] = True` to suppress Director guidance injection during the goodbye.

### Layer 2: Conversation Director (non-blocking, speculative pre-processing)

Primary LLM: **Groq** (gpt-oss-20b, ~70ms) / **Cerebras** (gpt-oss-120b, ~70ms) — random selection per call. Fallback: **Gemini Flash**. Runs via `asyncio.create_task()` — never blocks the pipeline.

The Director receives the senior's **location (city/state)** and **today's date** in every turn template, enabling specific predictions like `"Austin Texas weather March 2026"` instead of generic `"weather tomorrow"`. This dramatically improves web search prefetch cache hit rates.

**Dynamic news injection**: News context is NOT in the system prompt (saves ~300 tokens/turn). Instead, the Director signals `should_mention_news: true` when contextually appropriate, and the processor injects news into the guidance. One-shot: injected at most once per call.

**Speculative pre-processing** enables same-turn guidance injection:

1. On each `InterimTranscriptionFrame` (while user speaks):
   - Stores latest interim text, resets 250ms silence timer
   - Cancels any running speculative analysis (text changed)
   - Debounced memory prefetch (1s gap, 15+ chars)
2. After 250ms gap in interims (silence detected):
   - Starts speculative Cerebras analysis using last interim text
3. On `TranscriptionFrame` (after VAD 1.2s silence):
   - **Checks speculative result**: if done + Jaccard(interim, final) ≥ 0.7 → injects **SAME-TURN** guidance
   - Otherwise falls back to **PREVIOUS-TURN** cached guidance (original behavior)
   - Takes fallback actions (force end, wrap-up injection)
   - If speculative wasn't used → starts regular background analysis
   - Starts 1st-wave regex prefetch (non-blocking)
4. Background analysis calls Cerebras (→ Gemini fallback) with full conversation context
5. After analysis completes, starts 2nd-wave director-driven prefetch

**Metrics** (logged on EndFrame): `[Director] Call summary: 8 turns, 6/7 speculative hits (86%), 1 cancels`

**Fallback Actions** (when Claude misses things):
- **Force winding-down** at 9 minutes — overrides call phase to winding_down
- **Force call end** at 12 minutes — queues EndFrame after 3s delay
- **Force closing** when Director says closing + call > 8min — EndFrame after 5s

#### Director Output Schema

The Director classifies calls into 5 analytical phases (including "rapport" between opening and main), while the Flows state machine uses 4 phases (opening, main, winding_down, closing). The Director's `call_phase` is informational guidance — it doesn't directly control Flows transitions.

```json
{
  "analysis": {
    "call_phase": "opening|rapport|main|winding_down|closing",
    "engagement_level": "high|medium|low",
    "current_topic": "string",
    "emotional_tone": "positive|neutral|concerned|sad"
  },
  "direction": {
    "stay_or_shift": "stay|transition|wrap_up",
    "next_topic": "string or null",
    "should_mention_news": false,
    "news_topic": "string or null",
    "pacing_note": "good|too_fast|dragging|time_to_close"
  },
  "reminder": {
    "should_deliver": false,
    "which_reminder": "string or null",
    "delivery_approach": "how to weave in naturally"
  },
  "guidance": {
    "tone": "warm|empathetic|cheerful|gentle|serious",
    "priority_action": "main thing to do",
    "specific_instruction": "actionable guidance"
  },
  "model_recommendation": {
    "use_sonnet": false,
    "max_tokens": 150,
    "reason": "why this token count"
  },
  "prefetch": {
    "memory_queries": ["keyword1", "keyword2"],
    "web_queries": ["Austin Texas weather March 2026"],
    "anticipated_tools": ["search_memories", "save_important_detail"]
  }
}
```

#### Compact Guidance Injection

Director output is condensed into a single-line string injected as a `[Director guidance]` user message:

```
main/medium/warm | REMIND: Take medication | (concerned)
winding_down/high/gentle | WINDING DOWN: Summarize key points, begin warm sign-off.
closing/medium/warm | CLOSING: Say a warm goodbye. Keep it brief.
```

### Predictive Context Engine (Speculative Prefetch)

The Director orchestrates a 2-wave speculative memory prefetch that eliminates tool-call latency. Memories are pre-fetched in the background and cached in `session_state["_prefetch_cache"]` so that when Claude calls `search_memories`, results return instantly from cache.

**Implementation**: `services/prefetch.py` (cache + extraction + runner), orchestrated by `conversation_director.py`.

#### Prefetch Timeline

```
User speaking...
  ├─ InterimTranscriptionFrame (every ~200ms from Deepgram)
  │   └─ Debounced prefetch (1s gap, 15+ chars, text changed)
  │      Regex topic extraction only → memory.search() → cache
  │
  └─ TranscriptionFrame (final, after VAD silence)
      │
      ├─ 1st wave (0ms): Regex extraction
      │   Topics (_TOPIC_PATTERNS from conversation_tracker)
      │   Entities ("my grandson", "my doctor")
      │   Names ("My grandson Jake" → "Jake")
      │   Activities ("went to church", "played bingo")
      │   Quick Observer signals (family, health, activity)
      │   → memory.search() → cache
      │
      └─ 2nd wave (~70ms): Director analysis (Groq/Cerebras)
          next_topic → anticipatory memory prefetch
          which_reminder → reminder context prefetch
          news_topic → personal connection prefetch
          current_topic (2+ turns) → sustained topic prefetch
          web_queries → web search prefetch (OpenAI, Jaccard 0.4 match)
          → memory.search() + web_search_query() → cache
```

#### Cache Design (PrefetchCache)

- **TTL**: 30 seconds per entry
- **Max entries**: 10 (evicts oldest on overflow)
- **Lookup**: Jaccard word-overlap similarity (threshold=0.3), no embeddings needed
- **Dedup**: Skips queries already cached via `get_recent_queries()`
- **Concurrency**: Max 2 concurrent `memory.search()` calls per wave
- **Metrics**: Hits/misses/hit rate logged at call end via MetricsLogger

#### Cache-First Tool Handlers

The `search_memories` tool in `flows/tools.py` checks the prefetch cache before making live calls:

```
Claude calls search_memories("gardening")
  → _prefetch_cache.get("gardening")  (Jaccard fuzzy match, threshold=0.3)
  → HIT: return cached results (~0ms)
  → MISS: fall through to live memory.search() (200-300ms)
```

#### Director-Owned Web Search (Gating)

Web search is handled entirely by the Conversation Director, not Claude. The Director runs web searches during speculative analysis and gates the TranscriptionFrame until results are ready:

```
User speaks → 250ms silence → Groq speculative starts
                               ↓ (~500-800ms)
                          Groq returns with web_queries
                          → web search starts immediately
                               ↓
VAD fires (1.2s) → TranscriptionFrame arrives at Director
                               ↓
Director checks: web search in-flight?
  YES → push TTSSpeakFrame("Let me check on that for you.")
        hold TranscriptionFrame
        await web search (max 10s)
        inject [WEB RESULT] into context
        release TranscriptionFrame → Claude responds with data
  NO  → push TranscriptionFrame normally
```

The Director's location/date context enables specific queries like `"Austin Texas weather March 2026"` instead of generic `"weather tomorrow"`.

#### Director Guidance Hints

When the prefetch cache has entries, the Director attaches hints to its guidance:
```
main/medium/warm | CONTEXT AVAILABLE: Memories about gardening, grandson
```
This nudges Claude to call `search_memories` — knowing the call will be instant.

## Pipecat Flows — Call Phase Management

The opening phase is merged into main — the bot starts directly in main (or reminder if pending) with the greeting prepended. This eliminates the `transition_to_main` double-LLM-call penalty (~3-5s saved on every call).

```
┌──────────────┐                            ┌──────────────┐
│   Reminder    │    transition_to_main      │    Main       │
│  (conditional)│ ─────────────────────────► │               │
│               │                            │ • Greeting +  │
│ • Greeting +  │                            │   Conversation│
│   reminders   │                            │ • Reminders   │
│ • respond_    │                            │ • Memory tools│
│   immediately │                            │ • News search │
│ (when initial)│                            │ • respond_    │
│               │                            │   immediately │
│               │                            │ (when initial)│
└──────────────┘                            └───────┬───────┘
                                                     │
                                    transition_to_winding_down
                                                     │
                                                     ▼
                                            ┌──────────────┐
                                            │ Winding Down  │
                                            │               │
                                            │ • Last remind │
                                            │ • Summary     │
                                            │ • Save details│
                                            └───────┬───────┘
                                                     │
                                        transition_to_closing
                                                     │
                                                     ▼
                                            ┌──────────────┐
                                            │   Closing     │
                                            │               │
                                            │ • Warm goodbye│
                                            │ • post_action:│
                                            │   end_convo   │
                                            │ • No tools    │
                                            └──────────────┘
```

### LLM Tools Available Per Phase

| Phase | Tools |
|-------|-------|
| **Reminder** *(conditional)* | `mark_reminder_acknowledged`, `save_important_detail`, `transition_to_main` |
| **Main** | `search_memories`, `save_important_detail`, `mark_reminder_acknowledged`, `check_caregiver_notes`, `transition_to_winding_down` |
| **Winding Down** | `mark_reminder_acknowledged`, `save_important_detail`, `check_caregiver_notes`, `transition_to_closing` |
| **Closing** | *(none — post_action ends call)* |

*Note: Web search is handled by the Conversation Director, not Claude. The Director runs web searches during speculative analysis and injects results as `[WEB RESULT]` messages into Claude's context.*

### Context Strategies Per Phase

| Phase | Strategy | Effect |
|-------|----------|--------|
| **Reminder** *(when initial)* | APPEND / respond_immediately | Greeting + reminders, responds right away |
| **Main** *(when initial)* | APPEND / respond_immediately | Greeting + full conversation, responds right away |
| **Main** *(after reminder)* | APPEND | Full in-call context retention (no summary truncation) |
| **Winding Down** | APPEND | Preserves recent context for summary |
| **Closing** | APPEND | Preserves goodbye context |

### Tool Descriptions

| Tool | Purpose |
|------|---------|
| `search_memories` | Semantic search of senior's memory bank (pgvector + HNSW) |
| `save_important_detail` | Store new memories (health, family, preference, life_event, emotional, activity) |
| `mark_reminder_acknowledged` | Track reminder delivery with acknowledgment status |
| `check_caregiver_notes` | Retrieve and deliver pending notes from caregivers |

## Post-Call Processing

When the Twilio client disconnects, `run_post_call()` in `services/post_call.py` executes:

1. **Complete conversation** — Updates DB with duration, status, transcript
2. **Call analysis** — Gemini Flash generates summary, concerns, engagement score (1-10), follow-up suggestions. Now also includes `mood` (e.g., happy, lonely, anxious) and `caregiver_sms` (a privacy-respecting, mood-aware message for caregivers)
2.5. **Caregiver notification** — POST to Node.js API for call_completed + concern_detected alerts. The `caregiver_sms` from analysis is sent to caregivers via this pipeline; if the senior seems down, it subtly suggests the caregiver give them a call
3. **Summary persistence** — Writes analysis summary to `conversations.summary` (enables `get_recent_summaries()` and cross-call context)
3.5. **Interest discovery** — Extracts new interests from conversation, updates senior profile
3.6. **Interest scores** — Computes engagement scores per interest topic
4. **Memory extraction** — OpenAI extracts facts/preferences/events from transcript, stores with embeddings
5. **Daily context** — Saves topics, advice, reminders, and summary for same-day cross-call memory
6. **Reminder cleanup** — Marks unacknowledged reminders for retry
7. **Cache clearing** — Clears senior context cache and reminder context
8. **Snapshot rebuild** — Rebuilds `seniors.call_context_snapshot` JSONB (analysis, summaries, turns, daily context) so next call reads a single column instead of 6 queries

## Directory Structure

```
pipecat/
├── main.py                          ← FastAPI entry point, /health, /ws, middleware
├── bot.py                           ← Pipeline assembly + run_bot()
├── config.py                        ← All env vars centralized
├── prompts.py                       ← System prompts + phase task instructions
│
├── api/
│   ├── routes/
│   │   ├── voice.py                 ← /voice/answer (TwiML), /voice/status
│   │   ├── calls.py                 ← /api/call, /api/calls, /api/calls/:sid/end
│   │   └── metrics.py               ← /api/metrics/* (call metrics for observability)
│   ├── middleware/
│   │   ├── auth.py                  ← 3-tier auth (cofounder key, JWT, Clerk)
│   │   ├── rate_limit.py            ← Rate limiting (slowapi)
│   │   ├── security.py              ← Security headers (HSTS, X-Frame-Options)
│   │   └── error_handler.py         ← Global error handlers
│   └── validators/
│       └── schemas.py               ← Pydantic input validation
│
├── flows/
│   ├── nodes.py                     ← 4 call phase NodeConfigs + system prompts
│   └── tools.py                     ← LLM tool schemas + async handlers (4 tools)
│
├── processors/
│   ├── patterns.py                  ← 268 regex patterns, 19 categories (data only)
│   ├── quick_observer.py            ← Layer 1: analysis logic + goodbye EndFrame
│   ├── conversation_director.py     ← Layer 2: Gemini Flash guidance (non-blocking)
│   ├── conversation_tracker.py      ← In-call topic/question/advice tracking + transcript
│   ├── metrics_logger.py            ← Call metrics logging processor
│   ├── goodbye_gate.py              ← False-goodbye grace period (NOT in active pipeline — available but unused)
│   └── guidance_stripper.py         ← Strips <guidance> tags and [BRACKETED] directives
│
├── services/
│   ├── prefetch.py                  ← Predictive Context Engine: cache, extraction, runner
│   ├── director_llm.py              ← Gemini Flash analysis for Director + prefetch hints (374 LOC)
│   ├── post_call.py                 ← Post-call orchestration (analysis, memory, cleanup, snapshot rebuild)
│   ├── reminder_delivery.py         ← Reminder delivery CRUD + prompt formatting
│   ├── call_analysis.py             ← Post-call analysis + call quality scoring (246 LOC)
│   ├── memory.py                    ← Semantic memory (pgvector, HNSW, circuit breaker) (392 LOC)
│   ├── greetings.py                 ← Sentiment-aware greeting templates + rotation (326 LOC)
│   ├── conversations.py             ← Conversation CRUD + transcript history
│   ├── interest_discovery.py        ← Interest extraction from conversations
│   ├── seniors.py                   ← Senior profile + per-senior call_settings (131 LOC)
│   ├── caregivers.py                ← Caregiver relationships + notes delivery (101 LOC)
│   ├── scheduler.py                 ← Reminder scheduling + outbound calls
│   ├── call_snapshot.py             ← Pre-computed call context snapshot (53 LOC)
│   ├── context_cache.py             ← Pre-cache senior context + news persistence (5 AM local)
│   ├── daily_context.py             ← Cross-call same-day memory
│   └── news.py                      ← News via OpenAI web search + circuit breaker (213 LOC)
│
├── db/
│   ├── client.py                    ← asyncpg pool + query helpers + health check (69 LOC)
│   └── migrations/                  ← SQL migrations (HNSW index, call_context_snapshot, call_metrics)
│
├── lib/
│   ├── circuit_breaker.py           ← Async circuit breaker for external services + Sentry breadcrumbs
│   ├── growthbook.py                ← GrowthBook SDK wrapper (feature flags + kill switches)
│   ├── cache_cleanup.py             ← Background TTL-based cache eviction loop
│   └── sanitize.py                  ← PII-safe logging (phone, name masking)
│
├── docs/
│   └── ARCHITECTURE.md              ← This file
│
├── tests/                           ← 61 test files + support dirs
│   ├── test_*.py                    (test modules — unit, frame, pipeline, simulation)
│   ├── test_regression_scenarios.py ← Scenario-based regression tests
│   ├── helpers/                     pipeline_builder, assertions
│   ├── mocks/                       mock_llm, mock_services, mock_stt, mock_transport, mock_tts
│   ├── scenarios/                   emotional_support, medication_reminder, memory_recall, etc.
│   ├── llm_simulation/              conversation_runner, senior_simulator, observer
│   ├── conftest.py                  shared fixtures
│   └── TESTING_DESIGN.md            test architecture docs
│
├── pyproject.toml                   ← Dependencies + project config
├── railway.toml                     ← Railway deployment config
└── Dockerfile                       ← python:3.12-slim + uv
```

## Two-Backend Architecture (by design)

```
┌─────────────────────────────────┐    ┌──────────────────────────────────┐
│    Pipecat (Python)              │    │    Node.js (Express)              │
│    Railway — PORT 7860           │    │    Railway — PORT 3001            │
│                                  │    │                                   │
│  • Pipecat FrameProcessor pipe   │    │  • REST APIs for frontends       │
│  • Pipecat Flows (4 phases)      │    │  • Reminder scheduler            │
│  • Quick Observer (268 patterns) │    │  • Call initiation (Twilio)      │
│  • Conversation Director (L2)    │    │  • Admin/consumer/observability  │
│  • ElevenLabs TTS (Pipecat)      │    │    API endpoints                 │
│  • Deepgram STT (Pipecat)        │    │                                   │
│  • FastAPI + WebSocket           │    │  SCHEDULER_ENABLED=true           │
│  • SCHEDULER_ENABLED=false       │    │                                   │
│                                  │    │  Frontends → this API             │
│  Twilio voice → this service     │    │                                   │
└─────────────────────────────────┘    └──────────────────────────────────┘
                │                                       │
                └───────────┬───────────────────────────┘
                            │
                ┌───────────▼───────────┐
                │   Shared Resources     │
                │                        │
                │  • Neon PostgreSQL DB   │
                │  • Same DB schema       │
                │  • Same API keys        │
                │  • Same JWT_SECRET      │
                │  • Same DONNA_API_KEY   │
                └────────────────────────┘
```

Running separate backends is an explicit decision. Pipecat handles real-time voice, Node.js handles REST APIs and scheduling.

### Key Differences from Node.js Stack

| Aspect | Node.js | Pipecat |
|--------|---------|---------|
| **Pipeline** | Custom streaming (v1-advanced.js) | Pipecat FrameProcessor pipeline |
| **Call phases** | Custom state machine in pipeline | Pipecat Flows (4 NodeConfigs) |
| **Director** | Inline in v1-advanced.js | Separate non-blocking FrameProcessor |
| **Transport** | Raw Twilio WebSocket | FastAPIWebsocketTransport + TwilioFrameSerializer |
| **LLM** | Claude (streaming, sentence-by-sentence) | AnthropicLLMService (Pipecat managed) |
| **TTS** | ElevenLabs WebSocket (custom) | ElevenLabs via Pipecat |
| **STT** | Deepgram (custom integration) | DeepgramSTTService (Pipecat managed) |
| **Goodbye** | Custom timer in v1-advanced.js | Quick Observer → EndFrame (2s delay) |
| **Scheduler** | Active (SCHEDULER_ENABLED=true) | Disabled (prevents dual-scheduler) |

## Tech Stack

| Component | Technology | Details |
|-----------|------------|---------|
| **Runtime** | Python 3.12 | asyncio, FastAPI |
| **Framework** | Pipecat v0.0.101+ | FrameProcessor pipeline |
| **Flows** | pipecat-ai-flows v0.0.22+ | 4-phase call state machine |
| **Hosting** | Railway | Docker (python:3.12-slim), port 7860 |
| **Phone** | Twilio Media Streams | WebSocket audio (mulaw 8kHz) |
| **Voice LLM** | Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) | AnthropicLLMService (prompt caching enabled) |
| **Director** | Groq (`gpt-oss-20b`) / Cerebras (`gpt-oss-120b`) | ~70ms primary, random selection |
| **Director Fallback** | Gemini 3 Flash Preview (`gemini-3-flash-preview`) | ~150ms when Groq/Cerebras unavailable |
| **Post-Call** | Gemini 3 Flash Preview (`gemini-3-flash-preview`) | Summary, concerns, engagement |
| **STT** | Deepgram Nova 3 | Real-time, interim results |
| **TTS** | ElevenLabs | `eleven_turbo_v2_5` |
| **VAD** | Silero | confidence=0.6, stop_secs=1.2, min_volume=0.5 |
| **Database** | Neon PostgreSQL + pgvector | asyncpg, connection pooling |
| **Embeddings** | OpenAI text-embedding-3-small | 1536 dimensions |
| **News** | OpenAI GPT-4o-mini | Web search tool, 1hr cache |

## Database Schema (shared)

11 tables, same schema as Node.js:

| Table | Purpose |
|-------|---------|
| `seniors` | Senior profiles (name, phone, interests, timezone, call_settings JSONB, call_context_snapshot JSONB, cached_news TEXT) |
| `conversations` | Call records (duration, metrics, transcript) |
| `memories` | Semantic memories (pgvector embeddings, HNSW index, decay) |
| `reminders` | Scheduled reminders |
| `reminder_deliveries` | Delivery tracking per call |
| `caregivers` | Caregiver-senior relationships |
| `caregiver_notes` | Notes from caregivers delivered during calls |
| `call_analyses` | Post-call AI analysis |
| `daily_call_context` | Cross-call same-day memory |
| `call_metrics` | Per-call observability metrics (latency, phases, tokens) |
| `admin_users` | Admin dashboard accounts (bcrypt) |

### Memory System

- **Embedding**: OpenAI `text-embedding-3-small` (1536 dimensions)
- **Index**: HNSW (cosine_ops, m=16, ef_construction=64)
- **Similarity**: Cosine similarity, 0.7 minimum threshold
- **Deduplication**: Skip if cosine > 0.9 with existing memory
- **Decay**: Effective importance = `base * 0.5^(days/30)` (30-day half-life)
- **Access Boost**: +10 importance if accessed in last week
- **Tiered Retrieval**: Critical → Contextual → Background
- **Mid-Call Refresh**: After 5+ minutes, topic-aware context refresh
- **Circuit Breaker**: Embedding calls protected (10s timeout, 3-failure threshold)

## Environment Variables

```bash
# Server
PORT=7860                        # Different from Node.js (3001)

# Twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# Database (shared with Node.js)
DATABASE_URL=...

# AI Services
ANTHROPIC_API_KEY=...            # Claude Sonnet (voice LLM)
GOOGLE_API_KEY=...               # Gemini Flash (Director + Analysis)
DEEPGRAM_API_KEY=...             # STT
ELEVENLABS_API_KEY=...           # TTS
ELEVENLABS_VOICE_ID=...          # Voice ID (optional, has default)
OPENAI_API_KEY=...               # Embeddings + news search

# Auth (shared with Node.js)
JWT_SECRET=...
DONNA_API_KEY=...
COFOUNDER_API_KEY_1=...          # Cofounder auth
COFOUNDER_API_KEY_2=...          # Cofounder auth

# Scheduler (MUST be false to prevent conflicts)
SCHEDULER_ENABLED=false

# Director models (optional — Groq/Cerebras are primary when available)
FAST_OBSERVER_MODEL=gemini-3-flash-preview   # Gemini fallback model
GROQ_API_KEY=...                             # Groq primary Director
CEREBRAS_API_KEY=...                         # Cerebras primary Director

# Testing
RUN_DB_TESTS=1                   # Set to run DB integration tests
```

---

*Last updated: March 2026 — v5.2 with multi-provider Director, web search prefetch, GrowthBook feature flags, call metrics observability, enhanced health endpoint*
