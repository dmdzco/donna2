# Donna System Architecture

> Technical architecture reference for the Donna AI companion voice system.

---

## Two-Backend Design

Donna runs two backends sharing the same PostgreSQL database:

| Backend | Language | Platform | Responsibility |
|---------|----------|----------|----------------|
| **Pipecat** | Python 3.12 | Railway (port 7860) | Real-time voice pipeline, WebSocket, health monitoring |
| **Node.js** | Express | Railway (port 3001) | Admin/consumer REST APIs, reminder scheduler, call initiation |

This is an **explicit architectural decision** — each backend owns a clear domain. Dual service implementations (e.g., `services/memory.js` and `pipecat/services/memory.py`) exist because each backend needs database access for its own purpose.

---

## Voice Pipeline (bot.py)

Linear pipeline of Pipecat `FrameProcessor`s. Frames flow top to bottom:

```
Twilio Audio ──► FastAPIWebsocketTransport
                        │
                   Deepgram STT (Nova 3, 8kHz mulaw)
                        │ TranscriptionFrame
                        ▼
              ┌─────────────────────┐
              │   Quick Observer     │  Layer 1 (0ms): 250+ regex patterns
              │   (BLOCKING)         │  Injects guidance via LLMMessagesAppendFrame
              │                      │  Strong goodbye → EndFrame
              └─────────┬───────────┘
                        ▼
              ┌─────────────────────┐   ┌─────────────────────────┐
              │ Conversation         │──►│ Background Analysis      │
              │ Director             │   │ Groq fast path          │
              │ (PASS-THROUGH)       │   │ Gemini fallback helper  │
              │                      │   │ + Memory prefetch       │
              │ Injects guidance +   │   │ + Same-turn guidance    │
              │ dynamic news context │   │ + Force end at 9/12min  │
              └─────────┬───────────┘   └─────────────────────────┘
                        ▼ (no delay)
              Context Aggregator (user) ← builds LLM context from transcriptions
                        ▼
              Claude Sonnet 4.5 + FlowManager (4-phase state machine)
                        │ TextFrame
                        ▼
              Conversation Tracker (topics, questions, advice + shared transcript)
                        ▼
              Guidance Stripper (strips <guidance> tags + [BRACKETED] directives)
                        ▼
              ElevenLabs TTS (eleven_turbo_v2_5)
                        ▼
              FastAPIWebsocketTransport ──► Twilio Audio (mulaw 8kHz)
                        ▼
              Context Aggregator (assistant) ← tracks assistant responses
```

**Key mechanism**: Both Quick Observer and Director inject guidance into Claude's context via `LLMMessagesAppendFrame(run_llm=False)`. Guidance appears as user-role messages before the next LLM call.

---

## 2-Layer Observer Architecture

### Layer 1: Quick Observer (`processors/quick_observer.py`)
- **Latency**: 0ms (blocking, inline)
- **Method**: 250+ regex patterns across 19 categories (health, goodbye, emotion, cognitive, activity, etc.)
- **Output**: Injects guidance for the current turn
- **Goodbye detection**: Strong goodbye → programmatic EndFrame after configured delay (bypasses unreliable LLM tool calls)

### Layer 2: Conversation Director (`processors/conversation_director.py`)
- **Latency**: non-blocking via `asyncio.create_task`; Groq is the active fast provider
- **Providers**: Groq (`gpt-oss-20b`) for fast speculative/query analysis; Gemini Flash remains available for regular non-speculative fallback analysis
- **Speculative analysis**: Detects silence onset (250ms gap in interims), starts analysis during silence for same-turn injection
- **Output**: Same-turn guidance (speculative hit) or previous-turn cached guidance (fallback)
- **Dynamic news**: Injects news context when `should_mention_news` is signaled (one-shot per call)
- **Location/date context**: Senior's city/state + today's date in every turn for specific prefetch predictions
- **Time enforcement**: Force winding-down at 9 minutes, force end at 12 minutes

---

## Call Phase State Machine (Pipecat Flows)

Conditional reminder, main, winding_down, and closing phases are managed by `FlowManager` with `NodeConfig` definitions:

| Phase | Tools Available | Context Strategy | Transition |
|-------|----------------|-----------------|------------|
| **Reminder** *(conditional)* | mark_reminder_acknowledged, transition_to_main | APPEND, respond_immediately | After reminders delivered |
| **Main** | web_search, mark_reminder_acknowledged, transition_to_winding_down | APPEND | Natural wind-down or Director force |
| **Winding Down** | mark_reminder_acknowledged, transition_to_closing | APPEND | Closing cue or Director force |
| **Closing** | *(none — post_action: end_conversation)* | APPEND | Auto-end |

### LLM Tools (2 active)
1. **web_search** — In-call factual search via Tavily first, OpenAI fallback.
2. **mark_reminder_acknowledged** — Track reminder delivery status.

Retired handlers remain in `pipecat/flows/tools.py` for Gemini/future work, but `make_flows_tools()` exposes only the two active tools above. Memory and caregiver-note context is prefetched/injected instead of exposed as Claude tools.

---

## Post-Call Processing (`services/post_call.py`)

Runs after Twilio disconnect, parallelized with `asyncio.gather`:

```
Step 1: Complete conversation (prerequisite) ───────── sequential
    │
    ├── Step 2: Call analysis (Gemini Flash)  ─────┐
    ├── Step 3: Memory extraction (OpenAI)    ─────┤  parallel
    ├── Step 5: Reminder cleanup              ─────┤
    └── Step 6: Cache clearing                ─────┘
                                                    │
Step 3.5: Interest discovery (depends on Step 2) ── sequential
Step 3.6: Interest scores (depends on Step 3.5)  ── sequential
Step 4: Daily context (depends on Step 2)        ── sequential
```

---

## Database Schema

**Engine**: Neon PostgreSQL with pgvector extension

| Table | Purpose | Key Fields / Indexes |
|-------|---------|-------------|
| `seniors` | User profiles, interests, call settings | phone (unique) |
| `conversations` | Call records with transcripts | call_sid, senior_id + started_at DESC |
| `memories` | Semantic memory store (pgvector embeddings) | senior_id, HNSW on embedding |
| `reminders` | Scheduled reminders (one-time + recurring) | scheduled_time WHERE active, is_recurring |
| `reminder_deliveries` | Delivery tracking per call attempt | reminder_id + scheduled_for, status |
| `caregivers` | Family member relationships | senior_id |
| `call_analyses` | Post-call analysis results | senior_id + created_at DESC |
| `daily_call_context` | Cross-call same-day memory | senior_id + call_date |
| `admin_users` | Dashboard admin accounts | email |
| `notifications` | Caregiver notification log | caregiver_id, senior_id, sent_at |
| `waitlist` | Public waitlist signups | name, email, phone, who_for |
| `audit_logs` | HIPAA audit events | user_id, action, resource_type, created_at |
| `prospects` | Onboarding callers (not yet seniors) | phone |

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Voice Pipeline | Pipecat | v0.0.101+ |
| Call State Machine | Pipecat Flows | v0.0.22+ |
| Primary LLM | Anthropic Claude Sonnet 4.5 | claude-sonnet-4-5-20250929 |
| Director LLM (active fast path) | Groq | gpt-oss-20b |
| Director LLM (regular fallback helper) | Google Gemini Flash | gemini-3-flash-preview |
| Post-Call Analysis | Google Gemini Flash | gemini-3-flash-preview |
| STT | Deepgram Nova 3 | 8kHz mulaw |
| TTS | ElevenLabs by default; Cartesia behind provider flag | eleven_turbo_v2_5 |
| VAD | Silero | confidence=0.6, stop_secs=1.2 |
| Embeddings | OpenAI | text-embedding-3-small |
| News / Web Search | OpenAI GPT-4o-mini + Tavily | OpenAI cached news; Tavily first/OpenAI fallback for in-call web_search |
| Telephony | Twilio | Media Streams WebSocket |
| Database | Neon PostgreSQL | pgvector extension |
| Server (Python) | FastAPI + uvicorn | v0.115+ |
| Server (Node.js) | Express | — |
| Monitoring | Sentry | FastAPI integration |
| Deployment | Railway | Docker (python:3.12-slim) |
| Frontend | React + Vite + Tailwind | Vercel |

---

## Key File Map

```
pipecat/
├── main.py                     ← Server entry, /health, /ws, middleware, graceful shutdown
├── bot.py                      ← Pipeline assembly, LOAD_TEST_MODE swap
├── config.py                   ← All env vars centralized (frozen dataclass + lru_cache)
├── prompts.py                  ← System prompts + phase task instructions
├── flows/
│   ├── nodes.py                ← 4 call phase NodeConfigs
│   └── tools.py                ← 2 active Claude tools + retired handlers
├── processors/
│   ├── patterns.py             ← 250+ regex patterns, 19 categories
│   ├── quick_observer.py       ← Layer 1: regex analysis + goodbye EndFrame
│   ├── conversation_director.py← Layer 2: Groq speculative guidance + memory/news injection
│   ├── conversation_tracker.py ← Topic/question/advice tracking
│   ├── guidance_stripper.py    ← Strip <guidance> tags from output
│   └── metrics_logger.py       ← Call metrics logging
├── services/
│   ├── scheduler.py            ← Pipecat-side scheduling helpers; Node scheduler is active
│   ├── post_call.py            ← Post-call: analysis, memory, cleanup, snapshot rebuild
│   ├── director_llm.py         ← Groq Director analysis + Gemini fallback helper
│   ├── memory.py               ← Semantic memory (pgvector, decay, dedup)
│   ├── prefetch.py             ← Predictive Context Engine (memory prefetch)
│   ├── news.py                 ← Cached news + live web_search provider fallback
│   ├── call_snapshot.py        ← Pre-computed call context snapshot
│   ├── context_cache.py        ← Pre-cache at 5 AM local + news persistence
│   └── ...                     ← 8+ additional service modules
├── api/
│   ├── routes/                 ← voice.py, calls.py
│   ├── middleware/             ← auth, api_auth, rate_limit, security, twilio, error_handler
│   └── validators/schemas.py   ← Pydantic input validation
├── db/client.py                ← asyncpg pool + slow query logging
├── lib/
│   ├── circuit_breaker.py      ← Async circuit breaker (3 states)
│   ├── redis_client.py         ← Redis/InMemory shared state
│   ├── growthbook.py           ← GrowthBook feature flags
│   └── sanitize.py             ← PII-safe logging
└── tests/                      ← 61 test files, 543+ tests
```
