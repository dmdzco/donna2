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
                         ▼ (on call end)
              Post-Call Analysis (Gemini Flash)
              - Summary, concerns, engagement score
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
│   ├── v1-advanced.js          ← Main voice pipeline + call state
│   ├── quick-observer.js       ← Layer 1: Instant regex patterns
│   └── fast-observer.js        ← Layer 2: Conversation Director
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
├── public/                         ← Static files (legacy)
├── apps/
│   ├── admin/                      ← Admin dashboard (React + Vite)
│   └── observability/              ← Observability dashboard (React)
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
| Modify post-call analysis | `services/call-analysis.js` |
| Change token selection logic | `pipelines/v1-advanced.js` (selectModelConfig) |
| Modify system prompts | `pipelines/v1-advanced.js` (buildSystemPrompt) |
| Add new API endpoint | `index.js` |
| Update admin UI | `apps/admin/src/pages/*` (React) |
| Update admin API client | `apps/admin/src/lib/api.ts` |
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
- ~~Streaming Pipeline~~ ✓ Completed (~400ms latency)
- ~~Dynamic Token Routing~~ ✓ Completed
- ~~Conversation Director~~ ✓ Completed
- ~~Post-Call Analysis~~ ✓ Completed
- ~~Admin Dashboard Separation~~ ✓ Completed (React app in `apps/admin/`)
- Prompt Caching (Anthropic)

### Architecture Cleanup

See [docs/ARCHITECTURE_CLEANUP_PLAN.md](docs/ARCHITECTURE_CLEANUP_PLAN.md) for the 7-phase restructuring plan:
- **Phase 1** ✓ Frontend Separation (Admin Dashboard → React)
- **Phase 2** Route Extraction (Split index.js)
- **Phase 3** Shared Packages (Turborepo monorepo)
- **Phase 4** TypeScript Migration
- **Phase 5** Testing Infrastructure
- **Phase 6** API Improvements (Zod, versioning)
- **Phase 7** Authentication (Clerk)
- Memory Context Improvements
- Caregiver Authentication (Clerk)
- Telnyx Migration (65% cost savings)

---

*Last updated: January 2026 - v3.1 (Conversation Director)*
