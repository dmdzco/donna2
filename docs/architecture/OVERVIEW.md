# Donna Architecture Overview

This document describes the Donna v3.0 system architecture with 4-layer observer and dynamic model routing.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DONNA v3.0 - 4-LAYER OBSERVER ARCHITECTURE                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐                                                        │
│   │  Admin Dashboard │                                                       │
│   │   /admin.html    │                                                       │
│   └────────┬─────────┘                                                       │
│            │                                                                 │
│            ▼                                                                 │
│   ┌──────────────────┐        ┌──────────────────┐                          │
│   │  Senior's Phone  │        │    /api/call     │                          │
│   └────────┬─────────┘        └────────┬─────────┘                          │
│            │                           │                                     │
│            ▼                           ▼                                     │
│   ┌────────────────────────────────────────────────┐                        │
│   │              Twilio Media Streams               │                        │
│   │           (WebSocket /media-stream)             │                        │
│   └────────────────────┬───────────────────────────┘                        │
│                        │                                                     │
│                        ▼                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      V1AdvancedSession                               │   │
│   │                  (pipelines/v1-advanced.js)                          │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │                                                                      │   │
│   │   Audio In → Deepgram STT → Process Utterance                       │   │
│   │                                   │                                  │   │
│   │               ┌───────────────────┼───────────────────┐             │   │
│   │               ▼                   ▼                   ▼             │   │
│   │         Layer 1 (0ms)      Layer 2 (~300ms)     Layer 3 (~800ms)    │   │
│   │         Quick Observer     Fast Observer        Deep Observer       │   │
│   │         (regex)            (Haiku+memory)       (Sonnet async)      │   │
│   │               │                   │                   │             │   │
│   │               └─────────┬─────────┘                   │             │   │
│   │                         ▼                             │             │   │
│   │              ┌─────────────────────┐                  │             │   │
│   │              │ Dynamic Model Select│←─────────────────┘             │   │
│   │              │  (selectModelConfig)│           (next turn)          │   │
│   │              └──────────┬──────────┘                                │   │
│   │                         ▼                                            │   │
│   │              Claude (Haiku or Sonnet)                               │   │
│   │              Streaming Response                                      │   │
│   │                         │                                            │   │
│   │                         ▼                                            │   │
│   │              Sentence Buffer                                         │   │
│   │                         │                                            │   │
│   │                         ▼                                            │   │
│   │              ElevenLabs WebSocket TTS                                │   │
│   │                         │                                            │   │
│   │                         ▼                                            │   │
│   │              Audio Out → Twilio                                      │   │
│   │                         │                                            │   │
│   │                         ▼                                            │   │
│   │              Layer 4: Post-Turn Agent (background)                   │   │
│   │              - Health concern extraction                             │   │
│   │              - Memory storage                                        │   │
│   │              - Topic prefetching                                     │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                        Shared Services                                │  │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │  │
│   │  │ Memory System│  │   Scheduler  │  │  News/Weather│               │  │
│   │  │ (pgvector)   │  │  (reminders) │  │ (OpenAI web) │               │  │
│   │  └──────────────┘  └──────────────┘  └──────────────┘               │  │
│   └────────────────────────────────────┬─────────────────────────────────┘  │
│                                        ▼                                     │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                     PostgreSQL (Neon + pgvector)                      │  │
│   │  seniors | conversations | memories | reminders                       │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4-Layer Observer Architecture

| Layer | File | Timing | Purpose | Affects |
|-------|------|--------|---------|---------|
| **1** | `quick-observer.js` | 0ms | Regex patterns (health, emotion) | Current response |
| **2** | `fast-observer.js` | ~300ms | Haiku analysis + memory search | Next response |
| **3** | `observer-agent.js` | ~800ms | Deep Sonnet analysis | Next response |
| **4** | `post-turn-agent.js` | After response | Background tasks | Storage/prefetch |

### Observer Outputs

Each observer outputs:
- **Guidance** - Instructions injected into system prompt
- **modelRecommendation** - Upgrade to Sonnet and/or increase tokens

---

## Dynamic Model Routing

The `selectModelConfig()` function selects model based on observer signals:

| Situation | Model | Tokens | Trigger |
|-----------|-------|--------|---------|
| Normal conversation | Haiku | 75 | Default |
| Health mention | Sonnet | 150 | Quick Observer |
| Emotional support | Sonnet | 150 | Quick/Fast Observer |
| Low engagement | Sonnet | 120 | Fast/Deep Observer |
| Simple question | Haiku | 60 | Quick Observer |
| Important memory | Sonnet | 150 | Fast Observer |
| Graceful ending | Sonnet | 150 | Deep Observer |

**Priority**: Quick > Fast > Deep (most urgent first)

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Hosting** | Railway |
| **Phone** | Twilio Media Streams |
| **AI (Default)** | Claude Haiku |
| **AI (Upgraded)** | Claude Sonnet |
| **STT** | Deepgram |
| **TTS** | ElevenLabs WebSocket |
| **Database** | Neon PostgreSQL + pgvector |
| **Embeddings** | OpenAI |

---

## Key Files

```
/
├── index.js                    ← Main server
├── pipelines/
│   ├── v1-advanced.js          ← Main pipeline + dynamic routing
│   ├── observer-agent.js       ← Layer 3: Deep analyzer
│   ├── quick-observer.js       ← Layer 1: Instant regex
│   ├── fast-observer.js        ← Layer 2: Haiku + memory
│   └── post-turn-agent.js      ← Layer 4: Background tasks
├── adapters/
│   ├── elevenlabs.js           ← REST TTS (fallback)
│   └── elevenlabs-streaming.js ← WebSocket TTS
├── services/
│   ├── seniors.js              ← Senior profile CRUD
│   ├── memory.js               ← Memory + semantic search
│   ├── conversations.js        ← Conversation records
│   ├── scheduler.js            ← Reminder scheduler
│   └── news.js                 ← News via OpenAI
├── db/
│   └── schema.js               ← Database schema
├── public/
│   └── admin.html              ← Admin UI
├── apps/
│   └── observability/          ← React dashboard
└── audio-utils.js              ← Audio conversion
```

---

## Database Schema

### Tables

- **seniors** - User profiles (name, phone, interests, medical notes)
- **conversations** - Call history (transcript, duration, status)
- **memories** - Long-term memory with vector embeddings
- **reminders** - Scheduled medication/appointment reminders

### Memory System

Uses pgvector for semantic search:
- Memories stored with 1536-dimensional OpenAI embeddings
- Cosine similarity search for related memories
- Automatic embedding generation on storage

---

## Latency Budget

| Component | Target |
|-----------|--------|
| Deepgram utterance detection | ~500ms |
| Quick Observer (L1) | 0ms |
| Dynamic model selection | <1ms |
| Claude Haiku first token | ~300ms |
| TTS first audio | ~150ms |
| **Total time-to-first-audio** | **~950ms** |

With Sonnet upgrade: add ~500ms for first token.

---

## Deployment

**Railway Configuration:**
1. Connect GitHub repository
2. Set environment variables (see `.env.example`)
3. Auto-deploys on push to main

**Required Environment Variables:**
- `TWILIO_*` - Phone integration
- `DATABASE_URL` - Neon PostgreSQL
- `ANTHROPIC_API_KEY` - Claude (Haiku + Sonnet)
- `ELEVENLABS_API_KEY` - TTS
- `DEEPGRAM_API_KEY` - STT
- `OPENAI_API_KEY` - Embeddings + news

---

*Last updated: January 2026 - v3.0*
