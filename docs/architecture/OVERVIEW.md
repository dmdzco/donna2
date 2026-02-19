# Donna Architecture Overview

This document describes the Donna v5.0 system architecture with the **Pipecat voice pipeline**, **2-Layer Conversation Director**, **Pipecat Flows** call state machine, and **infrastructure reliability** features (circuit breakers, feature flags, graceful shutdown).

> For detailed Pipecat implementation specifics, see [pipecat/docs/ARCHITECTURE.md](../../pipecat/docs/ARCHITECTURE.md).

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│              DONNA v5.0 — PIPECAT VOICE PIPELINE                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│   │  Admin Dashboard │  │  Consumer App   │  │  Observability  │            │
│   │  apps/admin-v2/  │  │ apps/consumer/  │  │   Dashboard     │            │
│   └────────┬─────────┘  └────────┬────────┘  └────────┬────────┘            │
│            │                     │                     │                     │
│            ▼                     ▼                     ▼                     │
│   ┌──────────────────────────────────────────────────────────────┐          │
│   │                  Node.js API (Railway)                        │          │
│   │    routes/ (16 modules) — consumed by all frontend apps      │          │
│   │    services/scheduler.js — reminder polling (still active)   │          │
│   └──────────────────────────────────────────────────────────────┘          │
│                                                                              │
│   ┌──────────────┐                                                          │
│   │ Senior's     │                                                          │
│   │ Phone        │                                                          │
│   └──────┬───────┘                                                          │
│          │                                                                   │
│          ▼                                                                   │
│   ┌──────────────────────────────────────────────────────────┐              │
│   │              Twilio Media Streams                         │              │
│   │         /voice/answer → <Stream url="/ws">                │              │
│   └────────────────────┬─────────────────────────────────────┘              │
│                        │ WebSocket                                           │
│                        ▼                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    Pipecat Pipeline (bot.py)                         │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │                                                                      │   │
│   │   Audio In → Deepgram STT (Nova 3, 8kHz)                             │   │
│   │                     │ TranscriptionFrame                             │   │
│   │                     ▼                                                │   │
│   │         ┌───────────────────────┐                                    │   │
│   │         │  Layer 1: Quick       │  0ms — BLOCKING                    │   │
│   │         │  Observer             │  268 regex patterns                │   │
│   │         │                       │  Injects guidance for THIS turn    │   │
│   │         │                       │  Goodbye → EndFrame (2s)           │   │
│   │         └───────────┬───────────┘                                    │   │
│   │                     ▼                                                │   │
│   │         ┌───────────────────────┐  ┌─────────────────────────┐      │   │
│   │         │  Layer 2: Conversation│─►│ Background: Gemini Flash│      │   │
│   │         │  Director             │  │ ~150ms, asyncio.task    │      │   │
│   │         │  (PASS-THROUGH)       │  │ Result cached → used on │      │   │
│   │         │                       │  │ NEXT turn's injection   │      │   │
│   │         │  Injects PREVIOUS     │  │ + mid-call mem refresh  │      │   │
│   │         │  turn's cached result │  │ + predictive prefetch   │      │   │
│   │         │                       │  │ + force end at 9/12min  │      │   │
│   │         └───────────┬───────────┘  └─────────────────────────┘      │   │
│   │                     │ (no delay)                                     │   │
│   │                     ▼                                                │   │
│   │         Context Aggregator (user) ← builds LLM context              │   │
│   │                     ▼                                                │   │
│   │         Claude Sonnet 4.5 + FlowManager (5 tools)                   │   │
│   │         (4 phases: opening → main → winding_down → closing)         │   │
│   │                     │ TextFrame                                      │   │
│   │                     ▼                                                │   │
│   │         Conversation Tracker (topics + shared transcript)            │   │
│   │                     ▼                                                │   │
│   │         Guidance Stripper (strips <guidance> + [BRACKETED])          │   │
│   │                     ▼                                                │   │
│   │         ElevenLabs TTS → Audio Out → Twilio (mulaw 8kHz)            │   │
│   │                     ▼                                                │   │
│   │         Context Aggregator (assistant) ← tracks responses            │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                        │                                                     │
│                        ▼ (on disconnect)                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │              Post-Call Processing (services/post_call.py)             │   │
│   │              1. Complete conversation record (DB)                     │   │
│   │              2. Call analysis — Gemini Flash (summary, concerns)     │   │
│   │              3. Memory extraction — OpenAI (facts, preferences)      │   │
│   │              4. Daily context — cross-call same-day memory            │   │
│   │              5. Reminder cleanup + cache clearing                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                        Shared Services                                │  │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │  │
│   │  │ Memory System │  │   Scheduler  │  │  News Service│               │  │
│   │  │ (pgvector)    │  │  (reminders) │  │ (OpenAI web) │               │  │
│   │  │ + HNSW index  │  │  + prefetch  │  │  + 1hr cache │               │  │
│   │  │ + decay/dedup │  │              │  │              │               │  │
│   │  └──────────────┘  └──────────────┘  └──────────────┘               │  │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │  │
│   │  │ Daily Context │  │ Context Cache│  │  Caregivers  │               │  │
│   │  │ (cross-call)  │  │ (5 AM local) │  │ + notes      │               │  │
│   │  └──────────────┘  └──────────────┘  └──────────────┘               │  │
│   │  ┌──────────────┐  ┌──────────────┐                                 │  │
│   │  │Circuit Breaker│  │Feature Flags │                                 │  │
│   │  │(Gemini, OAI)  │  │ (DB-backed)  │                                 │  │
│   │  └──────────────┘  └──────────────┘                                 │  │
│   └────────────────────────────────────┬─────────────────────────────────┘  │
│                                        ▼                                     │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                     PostgreSQL (Neon + pgvector)                      │  │
│   │  seniors | conversations | memories | reminders | reminder_deliveries │  │
│   │  caregivers | caregiver_notes | call_analyses | daily_call_context    │  │
│   │  feature_flags | admin_users                                          │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2-Layer Observer Architecture

| Layer | File | Model | Latency | Purpose |
|-------|------|-------|---------|---------|
| **1** | `processors/quick_observer.py` + `processors/patterns.py` | Regex | 0ms | 268 patterns: health, goodbye, emotion, safety + programmatic call end (2s EndFrame) |
| **2** | `processors/conversation_director.py` + `services/director_llm.py` | Gemini 3 Flash Preview | ~150ms | Non-blocking call guidance (phase, topic, reminders, fallback actions) |

### Post-Call Analysis (Async)

| Process | File | Model | Trigger | Output |
|---------|------|-------|---------|--------|
| Call Analysis | `services/call_analysis.py` | Gemini 3 Flash Preview | Call ends | Summary, concerns, engagement score, follow-ups |
| Memory Extraction | `services/memory.py` | OpenAI GPT-4o-mini | Call ends | Facts, preferences, events stored with embeddings |

---

## Conversation Director (Layer 2)

The Director runs **non-blocking** via `asyncio.create_task()`:

1. **Per-turn analysis** — Calls Gemini Flash with full conversation context
2. **Cached injection** — Injects PREVIOUS turn's guidance as `[Director guidance]` message
3. **Fallback actions** — Force winding-down at 9min, force call end at 12min
4. **Goodbye suppression** — Skips guidance injection when Quick Observer detects goodbye

### Director Output Schema

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

### Quick Observer (Layer 1)

268 regex patterns across 19 categories:

| Category | Patterns | Effect |
|----------|----------|--------|
| **Health** | 30+ patterns (pain, falls, medication, symptoms) | Health signals in context |
| **Emotion** | 25+ patterns with valence/intensity | Emotional tone detection |
| **Family** | 25+ relationship patterns including pets | Context enrichment |
| **Safety** | Scams, strangers, emergencies | Safety concern flags |
| **Goodbye** | Strong goodbye detection (bye, gotta go, take care) | **Notifies GoodbyeGate** |
| **Factual/Curiosity** | 18 patterns ("what year", "how tall") | Web search trigger |
| **Cognitive** | Confusion, repetition, time disorientation | Cognitive signals |

---

## Pipecat Flows — Call Phases

| Phase | Tools | Context Strategy |
|-------|-------|-----------------|
| **Opening** | search_memories, save_important_detail, check_caregiver_notes, transition_to_main | APPEND, respond_immediately |
| **Main** | search_memories, get_news, save_important_detail, mark_reminder_acknowledged, check_caregiver_notes, transition_to_winding_down | APPEND |
| **Winding Down** | mark_reminder_acknowledged, save_important_detail, transition_to_closing | APPEND |
| **Closing** | *(none — post_action: end_conversation)* | APPEND |

---

## Tech Stack

| Component | Technology | Details |
|-----------|------------|---------|
| **Runtime** | Python 3.12 | asyncio, FastAPI |
| **Framework** | Pipecat v0.0.101+ | FrameProcessor pipeline |
| **Flows** | pipecat-ai-flows v0.0.22+ | 4-phase call state machine |
| **Hosting** | Railway | Docker (python:3.12-slim), port 7860 |
| **Phone** | Twilio Media Streams | WebSocket audio (mulaw 8kHz) |
| **Voice LLM** | Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) | AnthropicLLMService |
| **Director** | Gemini 3 Flash Preview (`gemini-3-flash-preview`) | ~150ms non-blocking analysis |
| **Post-Call** | Gemini 3 Flash Preview (`gemini-3-flash-preview`) | Summary, concerns, engagement |
| **STT** | Deepgram Nova 3 (`nova-3-general`) | Real-time, interim results, 8kHz |
| **TTS** | ElevenLabs (`eleven_turbo_v2_5`) | Streaming voice synthesis |
| **VAD** | Silero | confidence=0.6, stop_secs=1.2, min_volume=0.5 |
| **Database** | Neon PostgreSQL + pgvector | asyncpg, connection pooling |
| **Embeddings** | OpenAI text-embedding-3-small | 1536 dimensions |
| **News** | OpenAI GPT-4o-mini | Web search tool, 1hr cache |

### Frontend Apps

### Frontend Apps

| App | Tech | URL |
|-----|------|-----|
| **Admin Dashboard v2** | React 18 + Vite + Tailwind + Radix UI | [admin-v2-liart.vercel.app](https://admin-v2-liart.vercel.app) |
| **Consumer App** | React 18 + Vite + Clerk + Framer Motion | [consumer-ruddy.vercel.app](https://consumer-ruddy.vercel.app) |
| **Observability** | React 18 + Vite (vanilla CSS) | [observability-five.vercel.app](https://observability-five.vercel.app) |

---

## Key Files

```
pipecat/
├── main.py                          ← FastAPI entry point, /health, /ws, middleware
├── bot.py                           ← Pipeline assembly + run_bot() + _run_post_call()
├── flows/
│   ├── nodes.py                     ← 4 call phase NodeConfigs + system prompts
│   └── tools.py                     ← 4 LLM tool schemas + async handlers
├── processors/
│   ├── patterns.py                  ← 268 regex patterns, 19 categories (data only)
│   ├── quick_observer.py            ← Layer 1: analysis logic + goodbye EndFrame
│   ├── conversation_director.py     ← Layer 2: Gemini Flash non-blocking guidance
│   ├── conversation_tracker.py      ← In-call topic/question/advice tracking
│   ├── metrics_logger.py            ← Call metrics logging processor
│   ├── goodbye_gate.py              ← False-goodbye grace period (NOT in active pipeline)
│   └── guidance_stripper.py         ← Strip <guidance> tags before TTS
├── services/
│   ├── director_llm.py              ← Gemini Flash analysis for Director
│   ├── call_analysis.py             ← Post-call analysis (Gemini Flash)
│   ├── memory.py                    ← Semantic memory (pgvector, decay, dedup)
│   ├── scheduler.py                 ← Reminder scheduling + outbound calls
│   ├── context_cache.py             ← Pre-cache at 5 AM local
│   ├── conversations.py             ← Conversation CRUD + transcripts
│   ├── daily_context.py             ← Cross-call same-day memory
│   ├── greetings.py                 ← Greeting templates + rotation
│   ├── interest_discovery.py        ← Interest extraction from conversations
│   ├── seniors.py                   ← Senior profile CRUD
│   ├── caregivers.py                ← Caregiver relationships
│   └── news.py                      ← News via OpenAI web search
├── api/
│   ├── routes/                      ← voice.py, calls.py
│   └── middleware/                   ← auth, api_auth, rate_limit, security, twilio
├── db/client.py                     ← asyncpg pool + query helpers
├── tests/                           ← 36 test files + helpers/mocks/scenarios
├── pyproject.toml                   ← Python 3.12, dependencies
└── Dockerfile                       ← python:3.12-slim + uv
```

---

## Database Schema

### Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| **seniors** | User profiles | name, phone, interests, familyInfo, medicalNotes, timezone, call_settings (JSONB) |
| **conversations** | Call records | callSid, transcript, duration, status, summary |
| **memories** | Long-term memory | content, type, importance, embedding (1536d, HNSW index) |
| **reminders** | Scheduled reminders | title, scheduledTime, isRecurring, type |
| **reminder_deliveries** | Delivery tracking | status, attemptCount, userResponse, callSid |
| **caregivers** | User-senior links | clerkUserId, seniorId, role |
| **caregiver_notes** | Notes from caregivers | content, is_delivered, delivered_at, call_sid |
| **call_analyses** | Post-call results | summary, engagementScore, concerns, followUps |
| **daily_call_context** | Same-day cross-call memory | seniorId, callDate, topicsDiscussed, remindersDelivered |
| **feature_flags** | Feature flag toggles | key (PK), enabled, description |
| **admin_users** | Admin dashboard accounts | email, passwordHash (bcrypt) |

### Memory System

- **Embedding**: OpenAI `text-embedding-3-small` (1536 dimensions)
- **Index**: HNSW (cosine_ops, m=16, ef_construction=64) — approximate nearest-neighbor
- **Similarity**: Cosine similarity, 0.7 minimum threshold
- **Deduplication**: Skip if cosine > 0.9 with existing memory
- **Decay**: Effective importance = `base * 0.5^(days/30)` (30-day half-life)
- **Access Boost**: +10 importance if accessed in last week
- **Tiered Retrieval**: Critical → Contextual → Background
- **Mid-Call Refresh**: After 5+ minutes, refresh context with current conversation topics
- **Circuit Breaker**: OpenAI embedding calls wrapped with 10s timeout + 3-failure threshold

---

## Infrastructure & Reliability (v5.0)

| Feature | Implementation | Details |
|---------|---------------|---------|
| **Circuit Breakers** | `lib/circuit_breaker.py` | Gemini (5s), OpenAI embedding (10s), news (10s) |
| **Feature Flags** | `lib/feature_flags.py` | DB-backed with 5-minute in-memory cache |
| **Graceful Shutdown** | `main.py` | Tracks active calls, 7s drain on SIGTERM |
| **Enhanced /health** | `main.py` | Database connectivity + circuit breaker states |
| **Per-Senior Settings** | `seniors.call_settings` | JSONB column for time limits, greeting style, etc. |

---

## Deployment

Three environments: **dev** (experiments), **staging** (CI), **production** (customers).

| Service | Platform | Port | URL |
|---------|----------|------|-----|
| Pipecat voice pipeline | Railway | 7860 | donna-pipecat-production.up.railway.app |
| Node.js API | Railway | 3001 | donna-api-production-2450.up.railway.app |
| Admin Dashboard | Vercel | — | admin-v2-liart.vercel.app |
| Consumer App | Vercel | — | consumer-ruddy.vercel.app |
| Observability | Vercel | — | observability-five.vercel.app |
| Database | Neon | — | Managed PostgreSQL + pgvector (3 branches) |

**CI/CD:** PRs → tests → staging deploy → smoke tests. Push to main → production auto-deploy.

---

*Last updated: February 2026 — v5.0 with circuit breakers, feature flags, caregiver notes, sentiment-aware greetings*
