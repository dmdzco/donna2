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
              │   (268 patterns)     │  → health, goodbye, emotion,
              │                      │    cognitive, activity signals
              │   Programmatic hang- │  → Strong goodbye detected:
              │   up: EndFrame after │    schedules EndFrame in 3.5s
              │   3.5s delay         │
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Conversation         │  Layer 2: Gemini Flash (~150ms)
              │ Director             │  NON-BLOCKING: async analysis
              │                      │  → Injects PREVIOUS turn guidance
              │                      │  → Background: analyzes THIS turn
              │                      │  → Fallback: force call end at 12min
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │  Context Aggregator  │  Builds LLM context from
              │  (user side)         │  transcription frames
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │   Anthropic LLM      │  Claude Sonnet 4.5 (streaming)
              │   + Flow Manager     │  Guided by Pipecat Flows
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
| **Goodbye** | Strong/weak goodbye detection | **Programmatic call end (3.5s)** |
| **Factual/Curiosity** | 18 patterns ("what year", "how tall") | Web search trigger |
| **Cognitive** | Confusion, repetition, time disorientation | Cognitive signals |

**Guidance injection**: When patterns match, Quick Observer builds a guidance string (e.g., `[HEALTH] They mentioned pain. Ask how they are feeling.`) and pushes it as an `LLMMessagesAppendFrame` with `run_llm=False`. This appends a user-role message to Claude's context before the next LLM call, steering the response without adding latency.

**Model recommendations**: Quick Observer also generates token budget recommendations based on signal priority (16 ordered rules). Crisis situations get 350 tokens; simple questions get 100. This data is available on the `AnalysisResult` but is not currently consumed by the pipeline — it's designed for future dynamic token routing.

**Programmatic Goodbye**: When a strong goodbye signal is detected (e.g., "goodbye", "talk to you later"), Quick Observer schedules an `EndFrame` after 3.5 seconds via the pipeline task reference. This bypasses unreliable LLM tool-calling for call termination. It also sets `session_state["_goodbye_in_progress"] = True` to suppress Director guidance injection during the goodbye.

### Layer 2: Conversation Director (~150ms, non-blocking)

Runs Gemini Flash per turn via `asyncio.create_task()` — never blocks the pipeline:

1. On each `TranscriptionFrame`:
   - Injects **PREVIOUS** turn's cached guidance via `LLMMessagesAppendFrame`
   - Takes fallback actions (force end, wrap-up injection)
   - Starts NEW background analysis for this turn
2. Background analysis calls Gemini Flash with full conversation context
3. Result is cached and applied on the next turn

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

## Pipecat Flows — Call Phase Management

```
┌──────────────┐     transition_to_main     ┌──────────────┐
│   Opening     │ ─────────────────────────► │    Main       │
│               │                            │               │
│ • Greeting    │                            │ • Conversation│
│ • Warm start  │                            │ • Reminders   │
│ • respond_    │                            │ • Memory tools│
│   immediately │                            │ • News search │
│               │                            │ • RESET_WITH_ │
│               │                            │   SUMMARY     │
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
| **Opening** | `search_memories`, `save_important_detail`, `transition_to_main` |
| **Main** | `search_memories`, `get_news`, `save_important_detail`, `mark_reminder_acknowledged`, `transition_to_winding_down` |
| **Winding Down** | `mark_reminder_acknowledged`, `save_important_detail`, `transition_to_closing` |
| **Closing** | *(none — post_action ends call)* |

### Tool Descriptions

| Tool | Purpose |
|------|---------|
| `search_memories` | Semantic search of senior's memory bank (pgvector) |
| `get_news` | Web search for current events via OpenAI |
| `save_important_detail` | Store new memories (health, family, preference, life_event, emotional, activity) |
| `mark_reminder_acknowledged` | Track reminder delivery with acknowledgment status |

## Post-Call Processing

When the Twilio client disconnects, `run_post_call()` in `services/post_call.py` executes:

1. **Complete conversation** — Updates DB with duration, status, transcript
2. **Call analysis** — Gemini Flash generates summary, concerns, engagement score (1-10), follow-up suggestions
3. **Memory extraction** — OpenAI extracts facts/preferences/events from transcript, stores with embeddings
4. **Daily context** — Saves topics, advice, reminders for same-day cross-call memory
5. **Reminder cleanup** — Marks unacknowledged reminders for retry
6. **Cache clearing** — Clears senior context cache and reminder context

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
│   │   └── calls.py                 ← /api/call, /api/calls, /api/calls/:sid/end
│   ├── middleware/
│   │   ├── auth.py                  ← JWT admin auth
│   │   ├── api_auth.py              ← API key auth (DONNA_API_KEY)
│   │   ├── rate_limit.py            ← Rate limiting (slowapi)
│   │   ├── security.py              ← Security headers (HSTS, X-Frame-Options)
│   │   ├── twilio.py                ← Twilio webhook signature validation
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
│   ├── goodbye_gate.py              ← False-goodbye grace period (NOT in active pipeline — available but unused)
│   └── guidance_stripper.py         ← Strips <guidance> tags and [BRACKETED] directives
│
├── services/
│   ├── director_llm.py              ← Gemini Flash analysis for Director (non-blocking)
│   ├── post_call.py                 ← Post-call orchestration (analysis, memory, cleanup)
│   ├── reminder_delivery.py         ← Reminder delivery CRUD + prompt formatting
│   ├── call_analysis.py             ← Post-call analysis (Gemini Flash)
│   ├── memory.py                    ← Semantic memory (pgvector, decay, dedup)
│   ├── greetings.py                 ← Time-based greeting templates + rotation
│   ├── daily_context.py             ← Cross-call same-day memory
│   ├── conversations.py             ← Conversation CRUD + transcript history
│   ├── seniors.py                   ← Senior profile CRUD
│   ├── caregivers.py                ← Caregiver-senior relationships
│   ├── scheduler.py                 ← Reminder scheduling + outbound calls
│   ├── context_cache.py             ← Pre-cache senior context (5 AM local)
│   └── news.py                      ← News via OpenAI web search (1hr cache)
│
├── db/
│   └── client.py                    ← asyncpg pool + query helpers
│
├── lib/
│   └── sanitize.py                  ← PII-safe logging (phone, name masking)
│
├── docs/
│   └── ARCHITECTURE.md              ← This file
│
├── tests/                           ← 13 test files
│   ├── test_quick_observer.py
│   ├── test_conversation_tracker.py
│   ├── test_goodbye_gate.py
│   ├── test_guidance_stripper.py
│   ├── test_nodes.py
│   ├── test_tools.py
│   ├── test_api_routes.py
│   ├── test_call_analysis.py
│   ├── test_daily_context.py
│   ├── test_greetings.py
│   ├── test_validators.py
│   ├── test_sanitize.py
│   └── test_db.py
│
├── pyproject.toml                   ← Dependencies + project config
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

## Tech Stack

| Component | Technology | Details |
|-----------|------------|---------|
| **Runtime** | Python 3.12 | asyncio, FastAPI |
| **Framework** | Pipecat v0.0.101+ | FrameProcessor pipeline |
| **Flows** | pipecat-ai-flows v0.0.22+ | 4-phase call state machine |
| **Hosting** | Railway | Docker, port 7860 |
| **Phone** | Twilio Media Streams | WebSocket audio (mulaw 8kHz) |
| **Voice LLM** | Claude Sonnet 4.5 | AnthropicLLMService |
| **Director** | Gemini 3 Flash Preview (`gemini-3-flash-preview`) | ~150ms non-blocking analysis |
| **Post-Call** | Gemini 3 Flash Preview (`gemini-3-flash-preview`) | Summary, concerns, engagement |
| **STT** | Deepgram Nova 3 | Real-time, interim results |
| **TTS** | ElevenLabs | `eleven_turbo_v2_5` |
| **Database** | Neon PostgreSQL + pgvector | asyncpg, connection pooling |
| **Embeddings** | OpenAI text-embedding-3-small | 1536 dimensions |
| **News** | OpenAI GPT-4o-mini | Web search tool, 1hr cache |
| **VAD** | Silero | confidence=0.6, stop_secs=1.2, min_volume=0.5 |

## Database Schema (shared)

9 tables, same schema as Node.js:

| Table | Purpose |
|-------|---------|
| `seniors` | Senior profiles (name, phone, interests, timezone) |
| `conversations` | Call records (duration, metrics, transcript) |
| `memories` | Semantic memories (pgvector embeddings, decay) |
| `reminders` | Scheduled reminders |
| `reminder_deliveries` | Delivery tracking per call |
| `caregivers` | Caregiver-senior relationships |
| `call_analyses` | Post-call AI analysis |
| `daily_call_context` | Cross-call same-day memory |
| `admin_users` | Admin dashboard accounts (bcrypt) |

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

# Scheduler (MUST be false to prevent conflicts)
SCHEDULER_ENABLED=false

# Director model (optional)
FAST_OBSERVER_MODEL=gemini-3-flash-preview

# Testing
RUN_DB_TESTS=1                   # Set to run DB integration tests
```

---

*Last updated: February 2026 — Pipecat migration with Conversation Director*
