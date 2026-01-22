# Donna Architecture Overview

This document describes the Donna v3.1 system architecture with the **Conversation Director** and post-call analysis.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              DONNA v3.1 - CONVERSATION DIRECTOR ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐  ┌─────────────────┐                                  │
│   │  Admin Dashboard │  │  Observability  │                                  │
│   │   /admin.html    │  │   Dashboard     │                                  │
│   └────────┬─────────┘  └────────┬────────┘                                  │
│            │                      │                                          │
│            ▼                      ▼                                          │
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
│   │              │ Dynamic Token Select│                                 │   │
│   │              │  (selectModelConfig)│                                 │   │
│   │              │   100-400 tokens    │                                 │   │
│   │              └──────────┬──────────┘                                 │   │
│   │                         ▼                                            │   │
│   │              Claude Sonnet 4.5 Streaming                             │   │
│   │                         │                                            │   │
│   │                         ▼                                            │   │
│   │              Sentence Buffer + <guidance> stripping                  │   │
│   │                         │                                            │   │
│   │                         ▼                                            │   │
│   │              ElevenLabs WebSocket TTS                                │   │
│   │                         │                                            │   │
│   │                         ▼                                            │   │
│   │              Audio Out → Twilio (mulaw 8kHz)                         │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                        │                                                     │
│                        ▼ (on call end)                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │              Post-Call Analysis (Async Batch)                        │   │
│   │              (services/call-analysis.js)                             │   │
│   │              - Call summary generation                               │   │
│   │              - Caregiver alerts (health/cognitive/safety)            │   │
│   │              - Engagement metrics (1-10 score)                       │   │
│   │              - Follow-up suggestions                                 │   │
│   │              - Memory extraction                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                        Shared Services                                │  │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │  │
│   │  │ Memory System│  │   Scheduler  │  │  News Service│               │  │
│   │  │ (pgvector)   │  │  (reminders) │  │ (OpenAI web) │               │  │
│   │  │ + decay      │  │  + prefetch  │  │  + 1hr cache │               │  │
│   │  └──────────────┘  └──────────────┘  └──────────────┘               │  │
│   └────────────────────────────────────┬─────────────────────────────────┘  │
│                                        ▼                                     │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                     PostgreSQL (Neon + pgvector)                      │  │
│   │  seniors | conversations | memories | reminders | reminderDeliveries  │  │
│   │                        | callAnalyses                                 │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Real-Time Observer Architecture (2-Layer)

| Layer | File | Model | Latency | Purpose | Affects |
|-------|------|-------|---------|---------|---------|
| **1** | `pipelines/quick-observer.js` | Regex | 0ms | Instant pattern detection (health, emotion, engagement) | Current response tokens |
| **2** | `pipelines/fast-observer.js` | Gemini 3 Flash | ~100-150ms | Conversation Director (call phase, topic, reminders) | Current response guidance |

### Post-Call Analysis (Async Batch)

| Process | File | Model | Trigger | Output |
|---------|------|-------|---------|--------|
| Call Analysis | `services/call-analysis.js` | Gemini Flash | Call ends | Summary, concerns, engagement score, follow-ups |
| Memory Extraction | `pipelines/v1-advanced.js` | GPT-4o-mini | Call ends | Facts, preferences, events stored with embeddings |

---

## Conversation Director (Layer 2)

The **Conversation Director** proactively guides each call using Gemini 3 Flash (~150ms):

1. **Tracks State** - Topics covered, call phase (opening→rapport→main→closing), engagement level
2. **Steers Flow** - When to transition topics, what to discuss next, transition phrases
3. **Manages Reminders** - Finding natural moments to deliver (never during grief/sadness)
4. **Monitors Pacing** - Detecting if conversation is dragging or rushed
5. **Recommends Tokens** - 100-400 tokens based on emotional needs
6. **Provides Guidance** - Specific tone and instruction for Claude's response

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
    "pacing_note": "good|too_fast|dragging|time_to_close"
  },
  "reminder": {
    "should_deliver": boolean,
    "which_reminder": "string or null",
    "delivery_approach": "how to weave in naturally"
  },
  "guidance": {
    "tone": "warm|empathetic|cheerful|gentle|serious",
    "response_length": "brief|moderate|extended",
    "priority_action": "main thing to do"
  },
  "model_recommendation": {
    "max_tokens": 100-400,
    "reason": "why this token count"
  }
}
```

### Quick Observer (Layer 1)

Instant regex-based analysis (0ms) with comprehensive patterns:

| Category | Patterns | Token Impact |
|----------|----------|--------------|
| **Health** | 30+ patterns (pain, falls, medication, symptoms) | +50-100 tokens |
| **Emotion** | 25+ patterns with valence/intensity | +80-150 tokens |
| **Family** | 25+ relationship patterns including pets | Context only |
| **Safety** | Scams, strangers, emergencies | +100 tokens |
| **Engagement** | Response length analysis | +50 if low |
| **Questions** | Yes/no, WH-questions, opinions | Response type hint |

---

## Dynamic Token Routing

The `selectModelConfig()` function in `v1-advanced.js` merges recommendations from both layers:

| Situation | Tokens | Source |
|-----------|--------|--------|
| Normal conversation | 100 | Default |
| Health mention | 150-180 | Quick Observer (severity-based) |
| Safety concern (high) | 200 | Quick Observer |
| Emotional support | 200-250 | Director (emotional_tone: sad/concerned) |
| Low engagement | 200 | Director (engagement_level: low) |
| Reminder delivery | 150 | Director (should_deliver: true) |
| Call closing | 150 | Director (stay_or_shift: wrap_up) |
| Simple question | 80 | Quick Observer |
| Deep emotional moment | 300-400 | Director + Quick Observer combined |

**Selection Logic:**
1. Director's `model_recommendation.max_tokens` is the base
2. Quick Observer can **escalate** tokens for urgent signals (health, safety)
3. Final = `Math.max(director_tokens, quick_observer_tokens)`

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

| Component | Technology | Details |
|-----------|------------|---------|
| **Hosting** | Railway | Auto-deploy via `railway up` |
| **Phone** | Twilio Media Streams | WebSocket audio (mulaw 8kHz) |
| **Voice AI** | Claude Sonnet 4.5 | Streaming responses, extended thinking disabled |
| **Director** | Gemini 3 Flash | ~150ms, cost-efficient guidance |
| **Post-Call Analysis** | Gemini Flash | ~$0.0005/call |
| **STT** | Deepgram Nova 2 | Real-time, 500ms endpointing |
| **TTS** | ElevenLabs WebSocket | `eleven_turbo_v2_5`, Rachel voice |
| **Database** | Neon PostgreSQL + pgvector | Drizzle ORM |
| **Embeddings** | OpenAI text-embedding-3-small | 1536 dimensions |
| **News** | OpenAI GPT-4o-mini | Web search tool, 1hr cache |

---

## Key Files

```
/
├── index.js                    ← Express server, routes, WebSocket handlers
├── pipelines/
│   ├── v1-advanced.js          ← Main pipeline: STT→Observers→Claude→TTS
│   ├── quick-observer.js       ← Layer 1: 730+ lines of regex patterns
│   └── fast-observer.js        ← Layer 2: Conversation Director (Gemini)
├── adapters/
│   ├── llm/
│   │   ├── index.js            ← Multi-provider factory (Claude, Gemini)
│   │   ├── claude.js           ← Claude adapter with streaming
│   │   └── gemini.js           ← Gemini adapter for Director/Analysis
│   ├── elevenlabs.js           ← REST TTS (fallback/greetings)
│   └── elevenlabs-streaming.js ← WebSocket TTS (~150ms first audio)
├── services/
│   ├── call-analysis.js        ← Post-call: summary, concerns, score
│   ├── memory.js               ← Semantic search, decay, deduplication
│   ├── seniors.js              ← Senior CRUD, phone normalization
│   ├── conversations.js        ← Call records, transcripts
│   ├── scheduler.js            ← Reminder scheduling + prefetch
│   └── news.js                 ← OpenAI web search, 1hr cache
├── db/
│   └── schema.js               ← Database schema
├── providers/
│   ├── index.js                ← Provider factory
│   ├── voice-provider.js       ← Voice provider interface
│   └── memory-provider.js      ← Memory provider interface
├── packages/
│   ├── logger/                 ← TypeScript logging package
│   └── event-bus/              ← TypeScript event bus package
├── public/
│   └── admin.html              ← Legacy admin UI (fallback)
├── apps/
│   ├── admin/                  ← React admin dashboard (primary)
│   └── observability/          ← React observability dashboard
└── audio-utils.js              ← Audio conversion
```

---

## Database Schema

### Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| **seniors** | User profiles | name, phone, interests, familyInfo, medicalNotes |
| **conversations** | Call records | callSid, transcript, duration, status, summary |
| **memories** | Long-term memory | content, type, importance, embedding (1536d) |
| **reminders** | Scheduled reminders | title, scheduledTime, isRecurring, type |
| **reminderDeliveries** | Delivery tracking | status, attemptCount, userResponse |
| **callAnalyses** | Post-call results | summary, engagementScore, concerns, followUps |

### Memory System

Uses pgvector for semantic search with intelligent features:
- **Embedding**: OpenAI `text-embedding-3-small` (1536 dimensions)
- **Similarity**: Cosine similarity, 0.7 minimum threshold
- **Deduplication**: Skip if cosine > 0.9 with existing memory
- **Decay**: Effective importance = `base * 0.5^(days/30)` (30-day half-life)
- **Access Boost**: +10 importance if accessed in last week
- **Types**: fact, preference, event, concern, relationship

---

## Latency Budget (Streaming Pipeline)

| Component | Target |
|-----------|--------|
| Deepgram utterance detection | ~300ms |
| Quick Observer (L1) | 0ms |
| Conversation Director (L2) | ~150ms (parallel) |
| Claude first token | ~200ms |
| TTS first audio | ~100ms |
| **Total time-to-first-audio** | **~600ms** |

---

## Cost Summary (15-minute call estimate)

| Component | Model | Per Call | Per Turn |
|-----------|-------|----------|----------|
| L1 Quick Observer | Regex | $0 | $0 |
| L2 Conversation Director | Gemini 3 Flash | ~$0.01 | ~$0.0005 |
| Voice | Claude Sonnet 4.5 | ~$0.08 | ~$0.004 |
| Post-Call Analysis | Gemini Flash | ~$0.005 | N/A |
| Memory Extraction | GPT-4o-mini | ~$0.001 | N/A |
| Embeddings | OpenAI | ~$0.01 | ~$0.0005 |
| **Total AI** | | **~$0.11** | |
| Twilio Voice | | ~$0.30 | |
| Deepgram STT | | ~$0.065 | |
| ElevenLabs TTS | | ~$0.18 | |
| **Total per call** | | **~$0.65** | |

---

## Deployment

**Railway Configuration:**

```bash
# Deploy manually (recommended - webhook unreliable)
git push && git push origin main:master && railway up

# Or use alias after committing
git pushall && railway up
```

**Required Environment Variables:**

| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (3001) |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `TWILIO_ACCOUNT_SID` | Twilio account |
| `TWILIO_AUTH_TOKEN` | Twilio auth |
| `TWILIO_PHONE_NUMBER` | Donna's phone number |
| `ANTHROPIC_API_KEY` | Claude Sonnet 4.5 (voice) |
| `GOOGLE_API_KEY` | Gemini Flash (Director + Analysis) |
| `ELEVENLABS_API_KEY` | TTS |
| `DEEPGRAM_API_KEY` | STT |
| `OPENAI_API_KEY` | Embeddings + news search |

**Optional:**
- `V1_STREAMING_ENABLED` - Enable/disable streaming (default: true)
- `VOICE_MODEL` - Main voice model (default: claude-sonnet)
- `FAST_OBSERVER_MODEL` - Director model (default: gemini-3-flash)

---

## API Endpoints

### Voice Control
- `POST /voice/answer` - Twilio webhook (call answered)
- `POST /voice/status` - Twilio status callback
- `POST /api/call` - Initiate outbound call

### Data Management
- `GET/POST /api/seniors` - Senior CRUD
- `GET/POST /api/seniors/:id/memories` - Memory management
- `GET /api/seniors/:id/memories/search` - Semantic search
- `GET /api/conversations` - Call history
- `GET/POST/PATCH/DELETE /api/reminders` - Reminder management

### Observability
- `GET /api/observability/calls` - Recent calls
- `GET /api/observability/calls/:id/timeline` - Call events
- `GET /api/observability/calls/:id/turns` - Conversation turns
- `GET /api/observability/calls/:id/observer` - Observer signals

---

*Last updated: January 2026 - v3.1 (Conversation Director)*
