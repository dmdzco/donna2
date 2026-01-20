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

## Current Status: v2.5 (Streaming Pipeline)

### Working Features
- **Dual Pipeline Architecture** - Select V0 or V1 from admin UI
  - **V0**: Gemini 2.5 Native Audio (low latency)
  - **V1**: Streaming pipeline with multi-layer observers
- **V1 Streaming Pipeline** (NEW)
  - Pre-built greeting (no Claude call needed)
  - Claude streaming responses
  - WebSocket TTS (ElevenLabs)
  - Sentence-by-sentence audio delivery
  - Multi-layer observer architecture
- Real-time voice calls (Twilio)
- User speech transcription (Deepgram STT)
- Mid-conversation memory retrieval (triggers on keywords)
- News updates via OpenAI web search
- Scheduled reminder calls
- Enhanced Admin Dashboard (4 tabs)
- Senior profile management
- Memory storage with semantic embeddings (pgvector)
- **Observability Dashboard** - Call flow visualization and live monitoring

---

## Architecture

**Full documentation**: [docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md)

### Pipeline Comparison

| Feature | V0 (Gemini Native) | V1 (Claude + Streaming) |
|---------|-------------------|------------------------|
| **AI Model** | Gemini 2.5 Flash | Claude Sonnet (streaming) |
| **STT** | Gemini built-in + Deepgram | Deepgram |
| **TTS** | Gemini built-in | ElevenLabs WebSocket |
| **Greeting Latency** | ~500ms | ~400ms (pre-built) |
| **Response Latency** | ~500ms | ~800ms (streaming) |
| **Observer Layers** | No | 3 layers (0ms/300ms/800ms) |
| **Best For** | Quick responses | Quality + insights |

### V1 Streaming Architecture

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
                    Claude Streaming ←──────────────┘
                            │                 (next turn)
                            ▼
                    Sentence Buffer
                            │
                            ▼
                    ElevenLabs WebSocket TTS
                            │
                            ▼
                    Twilio (audio chunks)
```

### Key Files

```
/
├── index.js                    ← Main server + pipeline router
├── gemini-live.js              ← V0: Gemini native audio session
├── pipelines/
│   ├── v1-advanced.js          ← V1: Streaming Claude + Observers
│   ├── observer-agent.js       ← Layer 3: Deep conversation analyzer
│   ├── quick-observer.js       ← Layer 1: Instant regex patterns (NEW)
│   └── fast-observer.js        ← Layer 2: Haiku + memory search (NEW)
├── adapters/
│   ├── elevenlabs.js           ← ElevenLabs REST TTS adapter
│   └── elevenlabs-streaming.js ← ElevenLabs WebSocket TTS (NEW)
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
| Change V0 (Gemini) behavior | `gemini-live.js` |
| Change V1 (Claude) behavior | `pipelines/v1-advanced.js` |
| Modify streaming TTS | `adapters/elevenlabs-streaming.js` |
| Add instant analysis patterns | `pipelines/quick-observer.js` |
| Modify fast analysis (Haiku) | `pipelines/fast-observer.js` |
| Modify deep Observer Agent | `pipelines/observer-agent.js` |
| Change REST TTS settings | `adapters/elevenlabs.js` |
| Modify system prompts | `pipelines/v1-advanced.js` |
| Add new API endpoint | `index.js` |
| Update admin UI | `public/admin.html` |
| Database changes | `db/schema.js` |

### Environment Variables

```bash
# Required (Both Pipelines)
PORT=3001
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
DATABASE_URL=...
OPENAI_API_KEY=...          # Embeddings + news

# V0 Pipeline (Gemini)
GOOGLE_API_KEY=...

# V1 Pipeline (Claude + Observer + ElevenLabs)
ANTHROPIC_API_KEY=...
ELEVENLABS_API_KEY=...
DEEPGRAM_API_KEY=...        # Also used by V0 for memory triggers

# Optional
DEFAULT_PIPELINE=v1         # v0 or v1
V1_STREAMING_ENABLED=true   # Set to 'false' to disable streaming
```

### Pipeline Selection

The pipeline is selected:
1. **Per-call**: Via `pipeline` parameter in `/api/call` body
2. **Admin UI**: Dropdown in header persists to localStorage
3. **Default**: Falls back to `DEFAULT_PIPELINE` env var or `v0`

---

## Roadmap

See [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) for upcoming work:
- ~~V1 Latency Optimization~~ ✓ Completed (streaming pipeline)
- Caregiver Authentication
- Observer Signal Storage
- Analytics Dashboard

---

*Last updated: January 2026 - v2.5 (Streaming Pipeline)*
