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
- **Conversation Director Architecture (2-Layer + Post-Call)**
  - Layer 1: Quick Observer (0ms) - Instant regex patterns
  - Layer 2: Conversation Director (~150ms) - Proactive call guidance (Gemini 3 Flash)
  - Post-Call Analysis - Async batch analysis when call ends
- **Dynamic Token Routing** - Automatic token adjustment (100-400 tokens)
- **Streaming Pipeline** (~400ms time-to-first-audio)
  - Claude streaming responses (sentence-by-sentence)
  - ElevenLabs WebSocket TTS
  - Parallel connection startup
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
User speaks → Deepgram STT (Nova 2, 500ms endpointing)
                                  │
                  ┌───────────────┼───────────────┐
                  ▼               ▼               (parallel)
            Layer 1 (0ms)   Layer 2 (~150ms)
            Quick Observer  Conversation Director
            (730+ regex)    (Gemini 3 Flash)
                  │               │
                  └───────┬───────┘
                          ▼
              ┌─────────────────────┐
              │ selectModelConfig() │
              │   (100-400 tokens)  │
              └──────────┬──────────┘
                         ▼
              Claude Sonnet 4.5 Streaming
                         │
                         ▼
              Sentence Buffer + <guidance> stripping
                         │
                         ▼
              ElevenLabs WS (eleven_turbo_v2_5)
                         │
                         ▼
              Twilio (mulaw 8kHz)
                         │
                         ▼ (on call end)
              Post-Call Analysis (Gemini Flash)
              + Memory Extraction (GPT-4o-mini)
```

### Conversation Director

The Director (Gemini 3 Flash, ~150ms) proactively guides each call:

| Feature | Description |
|---------|-------------|
| **Call Phase Tracking** | opening → rapport → main → closing |
| **Topic Management** | When to stay, transition, or wrap up |
| **Reminder Delivery** | Natural moments (never during grief/sadness) |
| **Engagement Monitoring** | Detect low engagement, suggest re-engagement |
| **Emotional Detection** | Adjust tone for sad/concerned seniors |
| **Token Recommendations** | 100-400 tokens based on context |

### Quick Observer (Layer 1)

Instant regex patterns (0ms) for:
- **Health**: 30+ patterns (pain, falls, medication, symptoms)
- **Emotion**: 25+ patterns with valence/intensity
- **Family**: 25+ relationship patterns including pets
- **Safety**: Scams, strangers, emergencies
- **Engagement**: Response length analysis

### Dynamic Token Selection

| Situation | Tokens | Source |
|-----------|--------|--------|
| Normal conversation | 100 | Default |
| Health mention | 150-180 | Quick Observer |
| Safety (high severity) | 200 | Quick Observer |
| Emotional support | 200-250 | Director |
| Low engagement | 200 | Director |
| Reminder delivery | 150 | Director |
| Call closing | 150 | Director |
| Simple question | 80 | Quick Observer |

### Key Files

```
/
├── index.js                    ← Express server, routes, WebSocket handlers
├── pipelines/
│   ├── v1-advanced.js          ← Main pipeline (~1000 lines)
│   │                             - V1AdvancedSession class
│   │                             - processUtterance(), generateResponse()
│   │                             - selectModelConfig(), buildSystemPrompt()
│   │                             - Barge-in: interruptSpeech()
│   ├── quick-observer.js       ← Layer 1 (~730 lines)
│   │                             - quickAnalyze() - instant patterns
│   │                             - Health, emotion, safety patterns
│   │                             - modelRecommendation output
│   └── fast-observer.js        ← Layer 2 (~550 lines)
│                                 - getConversationDirection()
│                                 - runDirectorPipeline()
│                                 - formatDirectorGuidance()
├── adapters/
│   ├── llm/
│   │   ├── index.js            ← Model registry + factory
│   │   ├── claude.js           ← Streaming, thinking disabled
│   │   └── gemini.js           ← Role handling quirks
│   ├── elevenlabs.js           ← REST TTS (greetings)
│   └── elevenlabs-streaming.js ← WebSocket TTS (~150ms)
├── services/
│   ├── call-analysis.js        ← Post-call Gemini analysis
│   ├── memory.js               ← pgvector, decay, deduplication
│   ├── seniors.js              ← CRUD, phone normalization
│   ├── conversations.js        ← Call records, summaries
│   ├── scheduler.js            ← Reminders + context prefetch
│   └── news.js                 ← OpenAI web search + cache
├── db/
│   ├── client.js               ← Drizzle connection (Neon)
│   └── schema.js               ← 6 tables + pgvector
├── public/
│   └── admin.html              ← 4-tab admin dashboard
├── apps/
│   └── observability/          ← React dashboard (Vite)
└── audio-utils.js              ← mulaw↔PCM conversion
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
| Modify post-call analysis | `services/call-analysis.js` |
| Change token selection logic | `pipelines/v1-advanced.js` (selectModelConfig) |
| Modify system prompts | `pipelines/v1-advanced.js` (buildSystemPrompt) |
| Add new API endpoint | `index.js` |
| Update admin UI | `public/admin.html` |
| Database changes | `db/schema.js` |

### Deployment

**IMPORTANT**: Always deploy after committing and pushing changes:

```bash
git add . && git commit -m "your message" && git push && git push origin main:master && railway up
```

Or use the alias after committing:
```bash
git pushall && railway up
```

Railway's GitHub webhook is unreliable - always run `railway up` manually to deploy.

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

### Completed
- ✅ Streaming Pipeline (~400-500ms latency)
- ✅ Dynamic Token Routing (100-400 tokens)
- ✅ Conversation Director (Gemini 3 Flash)
- ✅ Post-Call Analysis (summary, concerns, score)
- ✅ Memory Improvements (decay, deduplication, tiered injection)
- ✅ Barge-in support

### Upcoming
- Prompt Caching (Anthropic) - ~90% input token savings
- Caregiver Authentication (Clerk)
- Telnyx Migration (~65% telephony cost savings)
- Call Analysis Dashboard

---

## Cost per 15-minute call

| Component | Cost |
|-----------|------|
| Twilio Voice | ~$0.30 |
| ElevenLabs TTS | ~$0.18 |
| Claude Sonnet 4.5 | ~$0.08 |
| Deepgram STT | ~$0.065 |
| Gemini Flash (Director + Analysis) | ~$0.015 |
| OpenAI (Embeddings + News) | ~$0.01 |
| **Total** | **~$0.65** |

---

*Last updated: January 2026 - v3.1 (Conversation Director)*
