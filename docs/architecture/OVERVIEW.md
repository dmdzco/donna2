# Donna Architecture Overview

This document describes the Donna v3.1 system architecture with the **Conversation Director** and post-call analysis.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              DONNA v3.1 - CONVERSATION DIRECTOR ARCHITECTURE                 │
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
│   │               ▼                   ▼                                  │   │
│   │         Layer 1 (0ms)     Layer 2 (~150ms)                          │   │
│   │         Quick Observer    Conversation Director                      │   │
│   │         (regex patterns)  (Gemini 3 Flash)                          │   │
│   │               │                   │                                  │   │
│   │               └─────────┬─────────┘                                  │   │
│   │                         ▼                                            │   │
│   │              ┌─────────────────────┐                                 │   │
│   │              │ Dynamic Model Select│                                 │   │
│   │              │  (selectModelConfig)│                                 │   │
│   │              └──────────┬──────────┘                                 │   │
│   │                         ▼                                            │   │
│   │              Claude (claude-sonnet)                                  │   │
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
│   │              Layer 3: Post-Turn Agent (background)                   │   │
│   │              - Health concern extraction                             │   │
│   │              - Memory storage                                        │   │
│   │              - Topic prefetching                                     │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                        │                                                     │
│                        ▼ (on call end)                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │              Post-Call Analysis (Async Batch)                        │   │
│   │              (services/call-analysis.js)                             │   │
│   │              - Call summary generation                               │   │
│   │              - Caregiver alerts (health/cognitive/safety)            │   │
│   │              - Engagement metrics                                    │   │
│   │              - Follow-up suggestions                                 │   │
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
│   │  seniors | conversations | memories | reminders | call_analyses       │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Real-Time Observer Architecture

| Layer | File | Model | Latency | Purpose | Affects |
|-------|------|-------|---------|---------|---------|
| **1** | `quick-observer.js` | Regex | 0ms | Instant pattern detection | Current response |
| **2** | `fast-observer.js` | Gemini 3 Flash | ~100-150ms | Conversation Director | Current/Next response |
| **3** | `post-turn-agent.js` | - | After response | Background tasks | Storage/prefetch |

### Post-Call Analysis (Async)

| Process | File | Model | Trigger | Output |
|---------|------|-------|---------|--------|
| Call Analysis | `services/call-analysis.js` | Gemini Flash | Call ends | Summary, alerts, analytics |

---

## Conversation Director (Layer 2)

The **Conversation Director** proactively guides each call:

1. **Tracks State** - Topics covered, call phase, engagement level
2. **Steers Flow** - When to transition topics, what to discuss next
3. **Manages Reminders** - Finding natural moments to deliver reminders
4. **Monitors Pacing** - Detecting if conversation is dragging or rushed
5. **Recommends Tokens** - When to use more/fewer tokens for response
6. **Provides Guidance** - Specific instructions for Claude's next response

### Director Output Schema

```javascript
{
  "analysis": {
    "call_phase": "opening|rapport|main|closing",
    "engagement_level": "high|medium|low",
    "current_topic": "string",
    "emotional_tone": "positive|neutral|concerned|sad"
  },
  "direction": {
    "stay_or_shift": "stay|transition|wrap_up",
    "next_topic": "string or null",
    "transition_phrase": "natural transition phrase"
  },
  "reminder": {
    "should_deliver": boolean,
    "which_reminder": "string",
    "delivery_approach": "how to weave in naturally"
  },
  "guidance": {
    "tone": "warm|empathetic|cheerful|gentle",
    "priority_action": "main thing to do",
    "specific_instruction": "concrete guidance"
  },
  "model_recommendation": {
    "max_tokens": 100-400,
    "reason": "why this token count"
  }
}
```

---

## Dynamic Model Routing

The `selectModelConfig()` function selects token count based on Director + Quick Observer:

| Situation | Tokens | Trigger |
|-----------|--------|---------|
| Normal conversation | 100 | Default |
| Health mention | 150 | Quick Observer |
| Emotional support | 200-250 | Director (emotional_tone: sad) |
| Low engagement | 200 | Director (engagement_level: low) |
| Reminder delivery | 150 | Director (should_deliver: true) |
| Call closing | 150 | Director (stay_or_shift: wrap_up) |

---

## Post-Call Analysis

When a call ends, async batch analysis runs:

```javascript
{
  "summary": "2-3 sentence call summary",
  "topics_discussed": ["greeting", "health", "family"],
  "engagement_score": 8,  // 1-10
  "concerns": [
    {
      "type": "health|cognitive|emotional|safety",
      "severity": "low|medium|high",
      "description": "what was observed",
      "recommended_action": "what caregiver should do"
    }
  ],
  "positive_observations": ["good engagement", "positive mood"],
  "follow_up_suggestions": ["ask about doctor appointment"]
}
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Hosting** | Railway |
| **Phone** | Twilio Media Streams |
| **Voice AI** | Claude Sonnet |
| **Director** | Gemini 3 Flash |
| **Post-Call Analysis** | Gemini Flash |
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
│   ├── v1-advanced.js          ← Main pipeline + call state tracking
│   ├── quick-observer.js       ← Layer 1: Instant regex patterns
│   ├── fast-observer.js        ← Layer 2: Conversation Director (Gemini Flash)
│   ├── post-turn-agent.js      ← Layer 3: Background tasks
│   └── observer-agent.js       ← DEPRECATED (kept for reference)
├── adapters/
│   ├── llm/index.js            ← Multi-provider LLM adapter
│   ├── elevenlabs.js           ← REST TTS (fallback)
│   └── elevenlabs-streaming.js ← WebSocket TTS
├── services/
│   ├── call-analysis.js        ← Post-call batch analysis
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
- **call_analyses** - Post-call analysis results (summary, concerns, metrics)

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
| Conversation Director (L2) | ~150ms (parallel) |
| Claude first token | ~300ms |
| TTS first audio | ~150ms |
| **Total time-to-first-audio** | **~600ms** |

---

## Cost Summary

| Component | Model | Per Call |
|-----------|-------|----------|
| L1 Quick Observer | Regex | $0 |
| L2 Conversation Director | Gemini 3 Flash | ~$0.0002 |
| Voice | Claude Sonnet | ~$0.003 |
| Post-Call Analysis | Gemini Flash | ~$0.0005 |
| **Total** | | **~$0.004** |

---

## Deployment

**Railway Configuration:**
1. Connect GitHub repository
2. Set environment variables (see `.env.example`)
3. Auto-deploys on push to main

**Required Environment Variables:**
- `TWILIO_*` - Phone integration
- `DATABASE_URL` - Neon PostgreSQL
- `ANTHROPIC_API_KEY` - Claude Sonnet
- `GOOGLE_API_KEY` - Gemini Flash (Director + Analysis)
- `ELEVENLABS_API_KEY` - TTS
- `DEEPGRAM_API_KEY` - STT
- `OPENAI_API_KEY` - Embeddings + news

---

*Last updated: January 2026 - v3.1 (Conversation Director)*
