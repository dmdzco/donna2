# Donna Project - AI Context

> **AI Assistants**: You have permission to update this file as the project evolves. Keep it accurate and current.

---

## Project Goal

**Donna** is an AI-powered companion that makes friendly phone calls to elderly individuals, providing:
- **Daily check-ins** - Warm, conversational calls to combat loneliness
- **Medication reminders** - Gentle, natural reminders woven into conversation
- **Companionship** - Discussing interests, sharing news, being a friendly presence
- **Caregiver peace of mind** - Summaries and alerts for family members

**Target Users**:
- **Seniors** (70+) who live alone or have limited social contact
- **Caregivers** (adult children, family) who want to ensure their loved ones are okay

---

## Current Status: v3.0 (4-Layer Observer + Dynamic Routing)

### Working Features
- **4-Layer Observer Architecture**
  - Layer 1: Quick Observer (0ms) - Instant regex patterns
  - Layer 2: Fast Observer (~300ms) - Haiku + memory search
  - Layer 3: Deep Observer (~800ms) - Sonnet analysis (async)
  - Layer 4: Post-Turn Agent - Background tasks after response
- **Dynamic Model Routing** - Automatic Haiku/Sonnet selection
- **Streaming Pipeline** (~400ms time-to-first-audio)
  - Pre-built greeting
  - Claude streaming responses
  - WebSocket TTS (ElevenLabs)
  - Sentence-by-sentence audio delivery
- Real-time voice calls (Twilio Media Streams)
- Speech transcription (Deepgram STT)
- Memory system with semantic search (pgvector)
- News updates via OpenAI web search
- Scheduled reminder calls
- Admin dashboard
- Observability dashboard

---

## Architecture

**Full documentation**: [docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md)

### 4-Layer Observer Architecture

```
User speaks → Deepgram STT → Process utterance
                                  │
                  ┌───────────────┼───────────────┐
                  ▼               ▼               ▼
            Layer 1 (0ms)   Layer 2 (~300ms)  Layer 3 (~800ms)
            Quick Observer  Fast Observer     Deep Observer
            (regex)         (Haiku+memory)    (Sonnet analysis)
                  │               │               │
                  └───────┬───────┘               │
                          ▼                       │
              ┌─────────────────────┐             │
              │ Dynamic Model Select│←────────────┘
              │ (Haiku or Sonnet)   │         (next turn)
              └──────────┬──────────┘
                         ▼
              Claude Streaming Response
                         │
                         ▼
              Sentence Buffer → ElevenLabs WS → Twilio
                         │
                         ▼
              Layer 4: Post-Turn Agent (background)
              - Health concern extraction
              - Memory storage
              - Topic prefetching
```

### Dynamic Model Selection

| Situation | Model | Tokens | Reason |
|-----------|-------|--------|--------|
| Normal conversation | Haiku | 75 | Fast, efficient |
| Health mention | Sonnet | 150 | Safety needs nuance |
| Emotional support | Sonnet | 150 | Empathy needs depth |
| Low engagement | Sonnet | 120 | Creative re-engagement |
| Simple question | Haiku | 60 | Quick answers better |
| Important memory | Sonnet | 150 | Personalized response |

### Key Files

```
/
├── index.js                    ← Main server
├── pipelines/
│   ├── v1-advanced.js          ← Main pipeline + dynamic routing
│   ├── observer-agent.js       ← Layer 3: Deep conversation analyzer
│   ├── quick-observer.js       ← Layer 1: Instant regex patterns
│   ├── fast-observer.js        ← Layer 2: Haiku + memory search
│   └── post-turn-agent.js      ← Layer 4: Background tasks
├── adapters/
│   ├── elevenlabs.js           ← ElevenLabs REST TTS adapter
│   └── elevenlabs-streaming.js ← ElevenLabs WebSocket TTS
├── services/
│   ├── memory.js               ← Memory storage + semantic search
│   ├── seniors.js              ← Senior profile CRUD
│   ├── conversations.js        ← Conversation history
│   ├── scheduler.js            ← Reminder scheduler
│   └── news.js                 ← News via OpenAI web search
├── db/
│   └── schema.js               ← Database schema (Drizzle ORM)
├── public/
│   └── admin.html              ← Admin UI
├── apps/
│   └── observability/          ← Observability dashboard (React)
└── audio-utils.js              ← Audio format conversion
```

---

## For AI Assistants

### When Making Changes

| Task | Where to Look |
|------|---------------|
| Change conversation behavior | `pipelines/v1-advanced.js` |
| Modify streaming TTS | `adapters/elevenlabs-streaming.js` |
| Add instant analysis patterns | `pipelines/quick-observer.js` |
| Modify fast analysis (Haiku) | `pipelines/fast-observer.js` |
| Modify deep Observer Agent | `pipelines/observer-agent.js` |
| Change background tasks | `pipelines/post-turn-agent.js` |
| Change model selection logic | `pipelines/v1-advanced.js` (selectModelConfig) |
| Modify system prompts | `pipelines/v1-advanced.js` (buildSystemPrompt) |
| Add new API endpoint | `index.js` |
| Update admin UI | `public/admin.html` |
| Database changes | `db/schema.js` |

### Environment Variables

```bash
# Required
PORT=3001
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
DATABASE_URL=...
OPENAI_API_KEY=...          # Embeddings + news
ANTHROPIC_API_KEY=...       # Claude (Haiku + Sonnet)
ELEVENLABS_API_KEY=...      # TTS
DEEPGRAM_API_KEY=...        # STT

# Optional
V1_STREAMING_ENABLED=true   # Set to 'false' to disable streaming
```

---

## Roadmap

See [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) for upcoming work:
- ~~V1 Latency Optimization~~ ✓ Completed
- ~~Haiku Default Model~~ ✓ Completed
- ~~Dynamic Model Routing~~ ✓ Completed
- ~~Post-Turn Agent (Layer 4)~~ ✓ Completed
- Caregiver Authentication (Clerk)
- Observer Signal Storage
- Analytics Dashboard

---

*Last updated: January 2026 - v3.0 (4-Layer Observer + Dynamic Routing)*
