# Donna Architecture Overview

This document describes the Donna v4.0 system architecture with the **Pipecat voice pipeline**, **2-Layer Conversation Director**, and **Pipecat Flows** call state machine.

> For detailed Pipecat implementation specifics, see [pipecat/docs/ARCHITECTURE.md](../../pipecat/docs/ARCHITECTURE.md).

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
│   │   Audio In → Deepgram STT (Nova 3)                                  │   │
│   │                     │ TranscriptionFrame                             │   │
│   │                     ▼                                                │   │
│   │         ┌───────────────────────┐                                    │   │
│   │         │  Layer 1: Quick       │  0ms — 252 regex patterns          │   │
│   │         │  Observer             │  Goodbye → notifies GoodbyeGate    │   │
│   │         └───────────┬───────────┘                                    │   │
│   │                     ▼                                                │   │
│   │         ┌───────────────────────┐                                    │   │
│   │         │  Layer 2: Conversation│  ~150ms — Gemini 3 Flash         │   │
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
│   │         GoodbyeGate (observes goodbye signals, 4s grace period)     │   │
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
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │  │
│   │  │ Daily Context │  │ Context Cache│  │  Caregivers  │               │  │
│   │  │ (cross-call)  │  │ (5 AM local) │  │ (access ctrl)│               │  │
│   │  └──────────────┘  └──────────────┘  └──────────────┘               │  │
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
| **1** | `processors/quick_observer.py` | Regex | 0ms | 252 patterns: health, goodbye, emotion, safety + notifies GoodbyeGate |
| **2** | `processors/conversation_director.py` + `services/director_llm.py` | Gemini 3 Flash | ~150ms | Non-blocking call guidance (phase, topic, reminders, fallback actions) |
| **Gate** | `processors/goodbye_gate.py` | Timer | 4s | False-goodbye protection: waits for mutual goodbye + 4s silence |

### Post-Call Analysis (Async)

| Process | File | Model | Trigger | Output |
|---------|------|-------|---------|--------|
| Call Analysis | `services/call_analysis.py` | Gemini 3 Flash | Call ends | Summary, concerns, engagement score, follow-ups |
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
| **Goodbye** | Strong goodbye detection (bye, gotta go, take care) | **Notifies GoodbyeGate** |
| **Factual/Curiosity** | 18 patterns ("what year", "how tall") | Web search trigger |
| **Cognitive** | Confusion, repetition, time disorientation | Cognitive signals |

---

## Pipecat Flows — Call Phases

| Phase | Tools | Context Strategy |
|-------|-------|-----------------|
| **Opening** | search_memories, save_important_detail, transition_to_main | respond_immediately |
| **Main** | search_memories, get_news, save_important_detail, mark_reminder_acknowledged, transition_to_winding_down | RESET_WITH_SUMMARY |
| **Winding Down** | mark_reminder_acknowledged, save_important_detail, transition_to_closing | APPEND |
| **Closing** | *(none — post_action ends call)* | APPEND |

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
| **Director** | Gemini 3 Flash | ~150ms non-blocking analysis |
| **Post-Call** | Gemini 3 Flash | Summary, concerns, engagement |
| **STT** | Deepgram Nova 3 | Real-time, interim results |
| **TTS** | ElevenLabs | `eleven_turbo_v2_5` |
| **VAD** | Silero | confidence=0.6, stop_secs=1.2, min_volume=0.5 |
| **Database** | Neon PostgreSQL + pgvector | asyncpg, connection pooling |
| **Embeddings** | OpenAI text-embedding-3-small | 1536 dimensions |
| **News** | OpenAI GPT-4o-mini | Web search tool, 1hr cache |

### Frontend Apps

| App | Tech | URL |
|-----|------|-----|
| **Admin Dashboard v2** | React 18 + Vite + Tailwind + Radix UI | [admin-v2-liart.vercel.app](https://admin-v2-liart.vercel.app) |
| **Consumer App** | React 18 + Vite + Clerk + Framer Motion | [consumer-ruddy.vercel.app](https://consumer-ruddy.vercel.app) |
| **Observability** | React 18 + Vite (vanilla CSS) | [observability-five.vercel.app](https://observability-five.vercel.app) |

---

## Deployment

| Service | Platform | Port | URL |
|---------|----------|------|-----|
| Pipecat voice pipeline | Railway | 7860 | donna-pipecat-production.up.railway.app |
| Node.js API (legacy) | Railway | 3001 | donna-api-production-2450.up.railway.app |
| Admin Dashboard | Vercel | — | admin-v2-liart.vercel.app |
| Consumer App | Vercel | — | consumer-ruddy.vercel.app |
| Observability | Vercel | — | observability-five.vercel.app |
| Database | Neon | — | Managed PostgreSQL + pgvector |

---

*Last updated: February 2026 — Pipecat v4.0 with Conversation Director + GoodbyeGate*
