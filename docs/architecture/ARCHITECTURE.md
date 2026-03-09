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
              │   Quick Observer     │  Layer 1 (0ms): 268 regex patterns
              │   (BLOCKING)         │  Injects guidance via LLMMessagesAppendFrame
              │                      │  Strong goodbye → EndFrame in 3.5s
              └─────────┬───────────┘
                        ▼
              ┌─────────────────────┐
              │ Conversation         │  Layer 2 (~150ms): Gemini Flash
              │ Director             │  NON-BLOCKING (asyncio.create_task)
              │                      │  Injects PREVIOUS turn's cached guidance
              │                      │  Force winding-down at 9min, end at 12min
              └─────────┬───────────┘
                        ▼
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
- **Method**: 268 regex patterns across 19 categories (health, goodbye, emotion, cognitive, activity, etc.)
- **Output**: Injects guidance for the current turn
- **Goodbye detection**: Strong goodbye → programmatic EndFrame after 3.5s delay (bypasses unreliable LLM tool calls)

### Layer 2: Conversation Director (`processors/conversation_director.py`)
- **Latency**: ~150ms (non-blocking via `asyncio.create_task`)
- **Method**: Gemini Flash per-turn semantic analysis
- **Output**: Injects previous turn's cached guidance (one turn behind)
- **Time enforcement**: Force winding-down at 9 minutes, force end at 12 minutes

---

## Call Phase State Machine (Pipecat Flows)

4 phases managed by `FlowManager` with `NodeConfig` definitions:

| Phase | Tools Available | Context Strategy | Transition |
|-------|----------------|-----------------|------------|
| **Opening** | search_memories, save_important_detail, transition_to_main | APPEND, respond_immediately | After greeting exchange |
| **Main** | search_memories, get_news, save_important_detail, mark_reminder_acknowledged | APPEND | Natural wind-down or 9min Director force |
| **Winding Down** | mark_reminder_acknowledged, save_important_detail | APPEND | Closing cue or 12min force |
| **Closing** | *(none — post_action: end_conversation)* | APPEND | Auto-end |

### LLM Tools (4 total)
1. **search_memories** — Semantic search via pgvector (tiered: critical → important → recent)
2. **get_news** — OpenAI web search with 1hr cache, filtered by senior interests
3. **save_important_detail** — Store new memory with deduplication
4. **mark_reminder_acknowledged** — Track reminder delivery status

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

| Table | Purpose | Key Indexes |
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
| `feature_flags` | Per-senior and global flags | — |
| `prospects` | Onboarding callers (not yet seniors) | phone |

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Voice Pipeline | Pipecat | v0.0.101+ |
| Call State Machine | Pipecat Flows | v0.0.22+ |
| Primary LLM | Anthropic Claude Sonnet 4.5 | claude-sonnet-4-5-20250929 |
| Director LLM | Google Gemini Flash | gemini-3-flash-preview |
| Post-Call Analysis | Google Gemini Flash | gemini-3-flash-preview |
| STT | Deepgram Nova 3 | 8kHz mulaw |
| TTS | ElevenLabs | eleven_turbo_v2_5 |
| VAD | Silero | confidence=0.6, stop_secs=1.2 |
| Embeddings | OpenAI | text-embedding-3-small |
| News Search | OpenAI | web search tool |
| Telephony | Twilio | Media Streams WebSocket |
| Database | Neon PostgreSQL | pgvector extension |
| Cache/State | Redis (optional) | v5.0+ |
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
│   └── tools.py                ← 4 LLM tool schemas + handlers
├── processors/
│   ├── patterns.py             ← 268 regex patterns, 19 categories
│   ├── quick_observer.py       ← Layer 1: regex analysis + goodbye EndFrame
│   ├── conversation_director.py← Layer 2: Gemini Flash non-blocking
│   ├── conversation_tracker.py ← Topic/question/advice tracking
│   ├── guidance_stripper.py    ← Strip <guidance> tags from output
│   └── metrics_logger.py       ← Call metrics logging
├── services/
│   ├── scheduler.py            ← Reminder polling + outbound calls + leader election
│   ├── post_call.py            ← Post-call: analysis, memory, cleanup (parallelized)
│   ├── memory.py               ← Semantic memory (pgvector, decay, dedup)
│   ├── prefetch.py             ← Predictive context engine (speculative prefetch)
│   ├── context_cache.py        ← Pre-cache at 5 AM local time
│   └── ...                     ← 10+ additional service modules
├── api/
│   ├── routes/                 ← voice.py, calls.py
│   ├── middleware/             ← auth, api_auth, rate_limit, security, twilio, error_handler
│   └── validators/schemas.py   ← Pydantic input validation
├── db/client.py                ← asyncpg pool + slow query logging
├── lib/
│   ├── circuit_breaker.py      ← Async circuit breaker (3 states)
│   ├── redis_client.py         ← Redis/InMemory shared state
│   ├── feature_flags.py        ← DB-backed feature flags
│   └── sanitize.py             ← PII-safe logging
└── tests/                      ← 61 test files, 543+ tests
```
