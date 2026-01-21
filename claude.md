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

## Current Status: v3.1 (Conversation Director)

### Working Features
- **Conversation Director Architecture**
  - Layer 1: Quick Observer (0ms) - Instant regex patterns
  - Layer 2: Conversation Director (~150ms) - Proactive call guidance (Gemini 3 Flash)
  - Layer 3: Post-Turn Agent - Background tasks after response
  - Post-Call Analysis - Async batch analysis when call ends
- **Dynamic Token Routing** - Automatic token adjustment based on context
- **Streaming Pipeline** (~600ms time-to-first-audio)
  - Pre-generated greeting
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

### Conversation Director Architecture

```
User speaks → Deepgram STT → Process utterance
                                  │
                  ┌───────────────┼───────────────┐
                  ▼               ▼
            Layer 1 (0ms)   Layer 2 (~150ms)
            Quick Observer  Conversation Director
            (regex)         (Gemini 3 Flash)
                  │               │
                  └───────┬───────┘
                          ▼
              ┌─────────────────────┐
              │ Dynamic Token Select│
              │   (100-400 tokens)  │
              └──────────┬──────────┘
                         ▼
              Claude Sonnet Streaming
                         │
                         ▼
              Sentence Buffer → ElevenLabs WS → Twilio
                         │
                         ▼
              Layer 3: Post-Turn Agent (background)
                         │
                         ▼ (on call end)
              Post-Call Analysis (Gemini Flash)
              - Summary, alerts, metrics
```

### Conversation Director

The Director proactively guides each call:

| Feature | Description |
|---------|-------------|
| **Call Phase Tracking** | opening → rapport → main → closing |
| **Topic Management** | When to stay, transition, or wrap up |
| **Reminder Delivery** | Natural moments to deliver reminders |
| **Engagement Monitoring** | Detect low engagement, suggest re-engagement |
| **Emotional Detection** | Adjust tone for sad/concerned seniors |
| **Token Recommendations** | 100-400 tokens based on context |

### Dynamic Token Selection

| Situation | Tokens | Trigger |
|-----------|--------|---------|
| Normal conversation | 100 | Default |
| Health mention | 150 | Quick Observer |
| Emotional support | 200-250 | Director |
| Low engagement | 200 | Director |
| Reminder delivery | 150 | Director |
| Call closing | 150 | Director |

### Key Files

```
/
├── index.js                    ← Main server
├── pipelines/
│   ├── v1-advanced.js          ← Main pipeline + call state tracking
│   ├── quick-observer.js       ← Layer 1: Instant regex patterns
│   ├── fast-observer.js        ← Layer 2: Conversation Director
│   ├── post-turn-agent.js      ← Layer 3: Background tasks
│   └── observer-agent.js       ← DEPRECATED (kept for reference)
├── adapters/
│   ├── llm/index.js            ← Multi-provider LLM adapter
│   ├── elevenlabs.js           ← ElevenLabs REST TTS adapter
│   └── elevenlabs-streaming.js ← ElevenLabs WebSocket TTS
├── services/
│   ├── call-analysis.js        ← Post-call batch analysis
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
| Modify Conversation Director | `pipelines/fast-observer.js` |
| Change background tasks | `pipelines/post-turn-agent.js` |
| Modify post-call analysis | `services/call-analysis.js` |
| Change token selection logic | `pipelines/v1-advanced.js` (selectModelConfig) |
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
ANTHROPIC_API_KEY=...       # Claude Sonnet (voice)
GOOGLE_API_KEY=...          # Gemini Flash (Director + Analysis)
ELEVENLABS_API_KEY=...      # TTS
DEEPGRAM_API_KEY=...        # STT

# Optional
V1_STREAMING_ENABLED=true   # Set to 'false' to disable streaming
VOICE_MODEL=claude-sonnet   # Main voice model
FAST_OBSERVER_MODEL=gemini-3-flash  # Director model
```

---

## Roadmap

See [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) for upcoming work:
- ~~V1 Latency Optimization~~ ✓ Completed
- ~~Dynamic Model Routing~~ ✓ Completed
- ~~Post-Turn Agent~~ ✓ Completed
- ~~Conversation Director~~ ✓ Completed
- ~~Post-Call Analysis~~ ✓ Completed
- Caregiver Authentication (Clerk)
- Call Analysis Dashboard
- Caregiver Notifications (SMS/Email)

---

*Last updated: January 2026 - v3.1 (Conversation Director)*
