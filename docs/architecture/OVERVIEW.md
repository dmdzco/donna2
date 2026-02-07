# Donna Architecture Overview

This document describes the Donna v4.0 system architecture with the **Pipecat voice pipeline**, **2-Layer Conversation Director**, and **Pipecat Flows** call state machine.

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│              DONNA v4.0 — PIPECAT VOICE PIPELINE                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│   │  Admin Dashboard │  │  Consumer App   │  │  Observability  │            │
│   │  apps/admin-v2/  │  │ apps/consumer/  │  │   Dashboard     │            │
│   └────────┬─────────┘  └────────┬────────┘  └────────┬────────┘            │
│            │                     │                                           │
│            ▼                     ▼                                           │
│   ┌──────────────────┐        ┌──────────────────┐                          │
│   │  Senior's Phone  │        │    /api/call      │                          │
│   └────────┬─────────┘        └────────┬──────────┘                          │
│            │                           │                                     │
│            ▼                           ▼                                     │
│   ┌──────────────────────────────────────────────────┐                      │
│   │              Twilio Media Streams                 │                      │
│   │         /voice/answer → <Stream url="/ws">        │                      │
│   └────────────────────┬─────────────────────────────┘                      │
│                        │ WebSocket                                           │
│                        ▼                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    Pipecat Pipeline (bot.py)                         │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │                                                                      │   │
│   │   Audio In → Deepgram STT (Nova 3)                                  │   │
│   │                     │ TranscriptionFrame                             │   │
│   │                     ▼                                                │   │
│   │         ┌───────────────────────┐                                    │   │
│   │         │  Layer 1: Quick       │  0ms — 252 regex patterns          │   │
│   │         │  Observer             │  Goodbye → EndFrame (3.5s)         │   │
│   │         └───────────┬───────────┘                                    │   │
│   │                     ▼                                                │   │
│   │         ┌───────────────────────┐                                    │   │
│   │         │  Layer 2: Conversation│  ~150ms — Gemini 2.0 Flash         │   │
│   │         │  Director             │  NON-BLOCKING (asyncio.create_task)│   │
│   │         │                       │  Injects prev-turn guidance        │   │
│   │         └───────────┬───────────┘  Fallback: force end at 12min     │   │
│   │                     ▼                                                │   │
│   │         Context Aggregator (user) → LLM Context                     │   │
│   │                     ▼                                                │   │
│   │         Claude Sonnet 4.5 + Pipecat Flows                           │   │
│   │         (4 phases: opening → main → winding_down → closing)         │   │
│   │                     │ TextFrame                                      │   │
│   │                     ▼                                                │   │
│   │         Conversation Tracker → Guidance Stripper                     │   │
│   │                     ▼                                                │   │
│   │         ElevenLabs TTS → Audio Out → Twilio (mulaw 8kHz)            │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                        │                                                     │
│                        ▼ (on disconnect)                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │              Post-Call Processing (_run_post_call)                    │   │
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
│   │  │ + decay/dedup │  │  + prefetch  │  │  + 1hr cache │               │  │
│   │  └──────────────┘  └──────────────┘  └──────────────┘               │  │
│   │  ┌──────────────┐  ┌──────────────┐                                  │  │
│   │  │ Daily Context │  │ Context Cache│                                  │  │
│   │  │ (cross-call)  │  │ (5 AM local) │                                  │  │
│   │  └──────────────┘  └──────────────┘                                  │  │
│   └────────────────────────────────────┬─────────────────────────────────┘  │
│                                        ▼                                     │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                     PostgreSQL (Neon + pgvector)                      │  │
│   │  seniors | conversations | memories | reminders | reminder_deliveries │  │
│   │  caregivers | call_analyses | daily_call_context | admin_users        │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2-Layer Observer Architecture

| Layer | File | Model | Latency | Purpose |
|-------|------|-------|---------|---------|
| **1** | `processors/quick_observer.py` | Regex | 0ms | 252 patterns: health, goodbye, emotion, safety + programmatic call end |
| **2** | `processors/conversation_director.py` + `services/director_llm.py` | Gemini 2.0 Flash | ~150ms | Non-blocking call guidance (phase, topic, reminders, fallback actions) |

### Post-Call Analysis (Async)

| Process | File | Model | Trigger | Output |
|---------|------|-------|---------|--------|
| Call Analysis | `services/call_analysis.py` | Gemini 2.0 Flash | Call ends | Summary, concerns, engagement score, follow-ups |
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

252 regex patterns across 19 categories:

| Category | Patterns | Effect |
|----------|----------|--------|
| **Health** | 30+ patterns (pain, falls, medication, symptoms) | Health signals in context |
| **Emotion** | 25+ patterns with valence/intensity | Emotional tone detection |
| **Family** | 25+ relationship patterns including pets | Context enrichment |
| **Safety** | Scams, strangers, emergencies | Safety concern flags |
| **Goodbye** | Strong goodbye detection (bye, gotta go, take care) | **Programmatic call end (3.5s EndFrame)** |
| **Factual/Curiosity** | 18 patterns ("what year", "how tall") | Web search trigger |
| **Cognitive** | Confusion, repetition, time disorientation | Cognitive signals |

---

## Pipecat Flows — Call Phases

| Phase | Tools | Context Strategy |
|-------|-------|-----------------|
| **Opening** | search_memories, save_important_detail, transition_to_main | respond_immediately |
| **Main** | search_memories, get_news, save_important_detail, mark_reminder_acknowledged, transition_to_winding_down | RESET_WITH_SUMMARY |
| **Winding Down** | mark_reminder_acknowledged, transition_to_closing | — |
| **Closing** | *(none — post_action ends call)* | — |

---

## Tech Stack

| Component | Technology | Details |
|-----------|------------|---------|
| **Runtime** | Python 3.12 | asyncio, FastAPI |
| **Framework** | Pipecat v0.0.101+ | FrameProcessor pipeline |
| **Flows** | pipecat-ai-flows v0.0.22+ | 4-phase call state machine |
| **Hosting** | Railway | Docker (python:3.12-slim), port 7860 |
| **Phone** | Twilio Media Streams | WebSocket audio (mulaw 8kHz) |
| **Voice LLM** | Claude Sonnet 4.5 | AnthropicLLMService |
| **Director** | Gemini 2.0 Flash | ~150ms non-blocking analysis |
| **Post-Call** | Gemini 2.0 Flash | Summary, concerns, engagement |
| **STT** | Deepgram Nova 3 | Real-time, interim results |
| **TTS** | ElevenLabs | `eleven_turbo_v2_5` |
| **VAD** | Silero | confidence=0.6, stop_secs=1.2, min_volume=0.5 |
| **Database** | Neon PostgreSQL + pgvector | asyncpg, connection pooling |
| **Embeddings** | OpenAI text-embedding-3-small | 1536 dimensions |
| **News** | OpenAI GPT-4o-mini | Web search tool, 1hr cache |

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
│   ├── quick_observer.py            ← Layer 1: 252 regex patterns + goodbye EndFrame
│   ├── conversation_director.py     ← Layer 2: Gemini Flash non-blocking guidance
│   ├── conversation_tracker.py      ← In-call topic/question/advice tracking
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
│   ├── seniors.py                   ← Senior profile CRUD
│   ├── caregivers.py                ← Caregiver relationships
│   └── news.py                      ← News via OpenAI web search
├── api/
│   ├── routes/                      ← voice.py, calls.py
│   └── middleware/                   ← auth, api_auth, rate_limit, security, twilio
├── db/client.py                     ← asyncpg pool + query helpers
├── tests/                           ← 13 test files, 163+ tests
├── pyproject.toml                   ← Python 3.12, dependencies
└── Dockerfile                       ← python:3.12-slim + uv
```

---

## Database Schema

### Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| **seniors** | User profiles | name, phone, interests, familyInfo, medicalNotes, timezone |
| **conversations** | Call records | callSid, transcript, duration, status, summary |
| **memories** | Long-term memory | content, type, importance, embedding (1536d) |
| **reminders** | Scheduled reminders | title, scheduledTime, isRecurring, type |
| **reminder_deliveries** | Delivery tracking | status, attemptCount, userResponse, callSid |
| **caregivers** | User-senior links | clerkUserId, seniorId, role |
| **call_analyses** | Post-call results | summary, engagementScore, concerns, followUps |
| **daily_call_context** | Same-day cross-call memory | seniorId, callDate, topicsDiscussed, remindersDelivered |
| **admin_users** | Admin dashboard accounts | email, passwordHash (bcrypt) |

### Memory System

- **Embedding**: OpenAI `text-embedding-3-small` (1536 dimensions)
- **Similarity**: Cosine similarity, 0.7 minimum threshold
- **Deduplication**: Skip if cosine > 0.9 with existing memory
- **Decay**: Effective importance = `base * 0.5^(days/30)` (30-day half-life)
- **Access Boost**: +10 importance if accessed in last week
- **Tiered Retrieval**: Critical → Contextual → Background

---

## Deployment

**Pipecat voice pipeline (Railway):**
```bash
cd pipecat && railway up
```

**Required Environment Variables:**

| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (7860) |
| `DATABASE_URL` | Neon PostgreSQL |
| `TWILIO_ACCOUNT_SID` | Twilio account |
| `TWILIO_AUTH_TOKEN` | Twilio auth |
| `TWILIO_PHONE_NUMBER` | Donna's phone number |
| `ANTHROPIC_API_KEY` | Claude Sonnet 4.5 (voice) |
| `GOOGLE_API_KEY` | Gemini Flash (Director + Analysis) |
| `ELEVENLABS_API_KEY` | TTS |
| `DEEPGRAM_API_KEY` | STT |
| `OPENAI_API_KEY` | Embeddings + news |
| `JWT_SECRET` | Admin JWT signing |
| `SCHEDULER_ENABLED` | Must be `false` (Node.js runs scheduler) |

---

*Last updated: February 2026 — Pipecat v4.0 with Conversation Director*
