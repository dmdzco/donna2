# Donna Architecture Overview

This document describes the Donna system architecture with dual V0/V1 pipelines.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DUAL PIPELINE ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐                                                        │
│   │  Admin Dashboard │ ← Pipeline Selector (V0/V1)                          │
│   │   /admin.html    │                                                       │
│   └────────┬─────────┘                                                       │
│            │                                                                 │
│            ▼                                                                 │
│   ┌──────────────────┐        ┌──────────────────┐                          │
│   │  Senior's Phone  │        │    /api/call     │ ← pipeline: 'v0' | 'v1'  │
│   └────────┬─────────┘        └────────┬─────────┘                          │
│            │                           │                                     │
│            ▼                           ▼                                     │
│   ┌────────────────────────────────────────────────┐                        │
│   │              Twilio Media Streams               │                        │
│   │           (WebSocket /media-stream)             │                        │
│   └────────────────────┬───────────────────────────┘                        │
│                        │                                                     │
│           ┌────────────┴────────────┐                                       │
│           │    Pipeline Router      │                                       │
│           │      (index.js)         │                                       │
│           └────────┬───────┬────────┘                                       │
│                    │       │                                                 │
│        ┌───────────┘       └───────────┐                                    │
│        ▼                               ▼                                    │
│ ┌─────────────────────────┐  ┌─────────────────────────────────────────┐   │
│ │   V0: GeminiLiveSession │  │      V1: V1AdvancedSession              │   │
│ │      (gemini-live.js)   │  │   (pipelines/v1-advanced.js)            │   │
│ ├─────────────────────────┤  ├─────────────────────────────────────────┤   │
│ │   Audio In ──────────┐  │  │   Audio In                              │   │
│ │                      ▼  │  │       ▼                                 │   │
│ │   ┌─────────────────────┐  │   ┌─────────────┐                       │   │
│ │   │  Gemini 2.5 Flash   │  │   │  Deepgram   │ ← STT                 │   │
│ │   │  (Native Audio)     │  │   └──────┬──────┘                       │   │
│ │   └──────────┬──────────┘  │          ▼                              │   │
│ │              │          │  │   ┌─────────────────────────────────┐   │   │
│ │              │          │  │   │  Claude Sonnet + Observer Agent │   │   │
│ │              │          │  │   └──────────────┬──────────────────┘   │   │
│ │              │          │  │                  ▼                      │   │
│ │              │          │  │   ┌─────────────┐                       │   │
│ │              │          │  │   │ ElevenLabs  │ ← TTS                 │   │
│ │              │          │  │   └──────┬──────┘                       │   │
│ │              ▼          │  │          ▼                              │   │
│ │        Audio Out        │  │    Audio Out                            │   │
│ └─────────────────────────┘  └─────────────────────────────────────────┘   │
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

## Pipeline Comparison

| Feature | V0 (Gemini Native) | V1 (Claude + Observer) |
|---------|-------------------|------------------------|
| **AI Model** | Gemini 2.5 Flash | Claude Sonnet |
| **STT** | Gemini built-in + Deepgram | Deepgram |
| **TTS** | Gemini built-in | ElevenLabs |
| **Latency** | ~500ms (1 API) | ~1.5-2s (3 APIs) |
| **Observer Agent** | No | Yes (every 30s) |
| **Voice Quality** | Good | Production-grade |
| **Customization** | Limited | Full control |
| **Cost** | Low | Higher (per-service) |

---

## Tech Stack

| Component | V0 | V1 | Shared |
|-----------|----|----|--------|
| **Hosting** | - | - | Railway |
| **Phone** | - | - | Twilio Media Streams |
| **AI** | Gemini 2.5 Flash | Claude Sonnet | - |
| **STT** | Deepgram (parallel) | Deepgram (main) | - |
| **TTS** | Gemini Native | ElevenLabs | - |
| **Observer** | - | Claude-based | - |
| **Database** | - | - | Neon PostgreSQL + pgvector |
| **Embeddings** | - | - | OpenAI |

---

## Key Files

```
/
├── index.js                    ← Main server + pipeline router
├── gemini-live.js              ← V0: Gemini native audio session
├── pipelines/
│   ├── v1-advanced.js          ← V1: Claude + Observer + ElevenLabs
│   └── observer-agent.js       ← Conversation analyzer
├── adapters/
│   └── elevenlabs.js           ← ElevenLabs TTS adapter
├── services/
│   ├── seniors.js              ← Senior profile CRUD
│   ├── memory.js               ← Memory storage + semantic search
│   ├── conversations.js        ← Conversation records
│   ├── scheduler.js            ← Reminder scheduler
│   └── news.js                 ← News via OpenAI web search
├── db/
│   └── schema.js               ← Database schema (Drizzle ORM)
├── public/
│   └── admin.html              ← Admin UI (4 tabs + pipeline selector)
└── audio-utils.js              ← Audio format conversion
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

## Deployment

**Railway Configuration:**
1. Connect GitHub repository
2. Set environment variables (see `.env.example`)
3. Auto-deploys on push to main

**Required Environment Variables:**
- `TWILIO_*` - Phone integration
- `DATABASE_URL` - Neon PostgreSQL
- `GOOGLE_API_KEY` - V0 pipeline (Gemini)
- `ANTHROPIC_API_KEY` - V1 pipeline (Claude)
- `ELEVENLABS_API_KEY` - V1 pipeline (TTS)
- `DEEPGRAM_API_KEY` - STT (both pipelines)
- `OPENAI_API_KEY` - Embeddings + news

---

*Last updated: January 2026*
