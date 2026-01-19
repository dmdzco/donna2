# Donna Project - AI Context
 
> **AI Assistants**: You have permission to update this file as the project evolves. Keep it accurate and current. When you make significant changes to the codebase or architecture, update this file accordingly.
 
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
 
**Core Philosophy**: Start simple, iterate fast, validate with real users before adding complexity.
 
---
 
## Next Session Focus

**See [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) for the complete implementation roadmap.**

Current priority: **V1 Pipeline Testing** (Claude + Observer + ElevenLabs)

### Quick Summary of Next Steps:
1. ~~**Deepgram STT**~~ - **DONE** (mid-call memory retrieval unlocked)
2. ~~**News Updates**~~ - **DONE** (OpenAI web search, cached 1hr)
3. ~~**Scheduled Calls**~~ - **DONE** (reminders trigger automated calls)
4. ~~**Admin Dashboard**~~ - **DONE** (4-tab interface with full management)
5. ~~**Dual Pipeline**~~ - **DONE** (V0 Gemini / V1 Claude+Observer selectable)
6. **Caregiver Login** - Secure multi-user access
7. **V1 Pipeline Testing** - Validate Claude + Observer + ElevenLabs

---

## Current Status: v2.4 (Dual Pipeline)

### Working Features
- **Dual Pipeline Architecture** - Select V0 or V1 from admin UI
  - **V0**: Gemini 2.5 Native Audio (current default)
  - **V1**: Deepgram STT → Claude + Observer → ElevenLabs TTS
- Real-time voice calls (Twilio)
- Bidirectional audio streaming via WebSocket
- AI transcription (Gemini output / Deepgram input)
- User speech transcription (Deepgram STT)
- Mid-conversation memory retrieval (triggers on keywords)
- News updates via OpenAI web search (based on interests, cached 1hr)
- Scheduled reminder calls (auto-triggers calls when reminders are due)
- **Enhanced Admin Dashboard** - 4 tabs: Dashboard, Seniors, Calls, Reminders
- Senior profile management with database
- Memory storage with semantic embeddings (pgvector + OpenAI)
- Memory extraction from conversations

### Environment Setup
```bash
DEEPGRAM_API_KEY=...        # Required for STT (both pipelines)
ELEVENLABS_API_KEY=...      # Required for V1 pipeline TTS
ANTHROPIC_API_KEY=...       # Required for V1 pipeline (Claude)
DEFAULT_PIPELINE=v0         # Optional: v0 or v1 (default: v0)
```

---

## Current Architecture (v2.4 - Dual Pipeline)

**Status**: Both pipelines running in production. Select from Admin UI.

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
│ │                         │  │                                         │   │
│ │   Audio In ──────────┐  │  │   Audio In                              │   │
│ │                      │  │  │       │                                 │   │
│ │                      ▼  │  │       ▼                                 │   │
│ │   ┌─────────────────────┐  │   ┌─────────────┐                       │   │
│ │   │  Gemini 2.5 Flash   │  │   │  Deepgram   │ ← STT                 │   │
│ │   │  (Native Audio)     │  │   │   (STT)     │                       │   │
│ │   │  AI + TTS in one    │  │   └──────┬──────┘                       │   │
│ │   └──────────┬──────────┘  │          │                              │   │
│ │              │          │  │          ▼                              │   │
│ │              │          │  │   ┌─────────────────────────────────┐   │   │
│ │              │          │  │   │  Claude Sonnet + Observer Agent │   │   │
│ │              │          │  │   │  (pipelines/observer-agent.js)  │   │   │
│ │              │          │  │   └──────────────┬──────────────────┘   │   │
│ │              │          │  │                  │                      │   │
│ │              │          │  │                  ▼                      │   │
│ │              │          │  │   ┌─────────────┐                       │   │
│ │              │          │  │   │ ElevenLabs  │ ← TTS                 │   │
│ │              │          │  │   │   (TTS)     │                       │   │
│ │              │          │  │   └──────┬──────┘                       │   │
│ │              │          │  │          │                              │   │
│ │              ▼          │  │          ▼                              │   │
│ │        Audio Out        │  │    Audio Out                            │   │
│ │                         │  │                                         │   │
│ │  + Deepgram (parallel)  │  │  Observer runs every 30s:               │   │
│ │    for memory triggers  │  │  • Engagement level                     │   │
│ │                         │  │  • Emotional state                      │   │
│ └─────────────────────────┘  │  • Reminder timing                      │   │
│                              │  • Concerns for caregivers              │   │
│                              └─────────────────────────────────────────┘   │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                        Shared Services                                │  │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │  │
│   │  │ Memory System│  │   Scheduler  │  │  News/Weather│               │  │
│   │  │ (pgvector)   │  │  (reminders) │  │ (OpenAI web) │               │  │
│   │  └──────────────┘  └──────────────┘  └──────────────┘               │  │
│   └────────────────────────────────┬─────────────────────────────────────┘  │
│                                    ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                     PostgreSQL (Neon + pgvector)                      │  │
│   │  seniors | conversations | memories | reminders                       │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Pipeline Comparison

| Feature | V0 (Gemini Native) | V1 (Claude + Observer) |
|---------|-------------------|------------------------|
| **AI Model** | Gemini 2.5 Flash | Claude Sonnet |
| **STT** | Gemini built-in + Deepgram | Deepgram |
| **TTS** | Gemini built-in | ElevenLabs |
| **Latency** | ~500ms (1 API) | ~1.5-2s (3 APIs) |
| **Observer Agent** | No | Yes (every 30s) |
| **Voice Quality** | Good | Production-grade |
| **Customization** | Limited | Full control |
| **Cost** | Low (free tier) | Higher (per-service) |
| **Status** | Default, stable | Testing |

### V0 Flow (Default)
1. Twilio audio → Gemini 2.5 Flash (native voice)
2. Gemini responds with audio
3. Deepgram runs in parallel for memory triggers
4. Memories extracted at call end

### V1 Flow (Advanced)
1. Twilio audio → Deepgram STT → text
2. Text → Claude with Observer signals
3. Observer Agent analyzes conversation every 30s
4. Claude response → ElevenLabs TTS → audio
5. Memories extracted at call end

### Tech Stack

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
| **Scheduler** | - | - | In-process polling |

### Key Files

```
/
├── index.js                    ← MAIN SERVER (Express + WebSocket + Pipeline Router)
├── gemini-live.js              ← V0: Gemini native audio session
├── pipelines/
│   ├── v1-advanced.js          ← V1: Advanced pipeline (STT → Claude → TTS)
│   └── observer-agent.js       ← V1: Observer Agent (conversation analyzer)
├── adapters/
│   └── elevenlabs.js           ← ElevenLabs TTS adapter
├── services/
│   ├── seniors.js              ← Senior profile CRUD
│   ├── memory.js               ← Memory storage + semantic search
│   ├── conversations.js        ← Conversation records
│   ├── scheduler.js            ← Reminder scheduler (polls every 60s)
│   └── news.js                 ← News via OpenAI web search
├── db/
│   └── schema.js               ← Database schema (Drizzle ORM)
├── public/
│   └── admin.html              ← Admin UI (4 tabs + pipeline selector)
├── audio-utils.js              ← Audio format conversion (mulaw ↔ PCM)
├── package.json
└── railway.json
```
 
---
 
## Development Phases

| Phase | Status | What's Included |
|-------|--------|-----------------|
| **A** | ✅ **COMPLETE** | Gemini voice, WebSocket streaming, outbound calls |
| **B** | ✅ **COMPLETE** | Database, senior profiles, memory system, Deepgram STT |
| **C** | ✅ **COMPLETE** | Scheduled calls, admin dashboard, news updates |
| **D** | ✅ **COMPLETE** | Dual pipeline (V0 Gemini / V1 Claude+Observer+ElevenLabs) |
| **E** | 🔄 **IN PROGRESS** | V1 testing, caregiver auth, analytics |

### Completed Milestones
1. ✅ Twilio voice integration
2. ✅ Gemini 2.5 native audio (bidirectional WebSocket)
3. ✅ Outbound calls via API
4. ✅ PostgreSQL + pgvector for memories
5. ✅ Senior profile management
6. ✅ Memory extraction from conversations
7. ✅ Deepgram STT for user transcription
8. ✅ Mid-call memory retrieval (keyword triggers)
9. ✅ News updates via OpenAI web search
10. ✅ Scheduled reminder calls (auto-trigger)
11. ✅ Enhanced admin dashboard (4 tabs)
12. ✅ **V1 Pipeline** (Claude + Observer + ElevenLabs)
13. ✅ **Pipeline selector** (switch between V0/V1 in UI)

### Next Up (Phase E)
- ⬜ **V1 Pipeline Testing** - Validate end-to-end call quality
- ⬜ **Caregiver Authentication** - Secure multi-user access (Clerk)
- ⬜ **Observer Logging** - Store observer signals in database
- ⬜ **Analytics Dashboard** - Call metrics, engagement trends
 
---
 
## Reference Directory
 
```
reference/
├── adapters/       # External service wrappers (Deepgram, ElevenLabs, etc.)
├── modules/        # Business logic modules
├── apps/           # Full Express API implementation
├── database/       # Drizzle ORM schemas
├── config/         # Dependency injection container
└── packages/       # Shared TypeScript interfaces
```
 
**IMPORTANT**: This code is from a **failed previous attempt**. It is kept for:
- ✅ Learning architectural patterns
- ✅ Reference for interface designs
- ✅ Future migration guidance
- ❌ NOT for current development
- ❌ NOT running or deployed
 
---
 
## For AI Assistants
 
### When Making Changes

| Task | Where to Look |
|------|---------------|
| Change V0 (Gemini) behavior | `gemini-live.js` |
| Change V1 (Claude) behavior | `pipelines/v1-advanced.js` |
| Modify Observer Agent | `pipelines/observer-agent.js` |
| Change TTS settings | `adapters/elevenlabs.js` |
| Modify system prompts | Both `gemini-live.js` and `pipelines/v1-advanced.js` |
| Add new API endpoint | `index.js` |
| Update admin UI | `public/admin.html` |
| Database changes | `db/schema.js` |
| Understand reference patterns | `reference/` (read-only, not active) |
| Check deployment config | `railway.json`, `.env.example` |

### Common Mistakes
1. ❌ Editing `reference/modules/` thinking it's active code
2. ❌ Forgetting to set `ELEVENLABS_API_KEY` when testing V1
3. ❌ Not selecting the correct pipeline in admin UI before calling
4. ❌ Looking at `reference/llm-conversation/` for current prompts
5. ❌ Treating `reference/` test counts as current project status

### Environment Variables

```bash
# ============ REQUIRED (Both Pipelines) ============
PORT=3001
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
DATABASE_URL=...            # Neon PostgreSQL
OPENAI_API_KEY=...          # For embeddings + news search

# ============ V0 PIPELINE (Gemini) ============
GOOGLE_API_KEY=...          # Gemini 2.5 Flash

# ============ V1 PIPELINE (Claude + Observer + ElevenLabs) ============
ANTHROPIC_API_KEY=...       # Claude Sonnet (conversation + observer)
ELEVENLABS_API_KEY=...      # Text-to-speech

# ============ BOTH PIPELINES ============
DEEPGRAM_API_KEY=...        # STT (required for V1, optional for V0)

# ============ OPTIONAL ============
DEFAULT_PIPELINE=v0         # v0 or v1 (default: v0)
```

### Pipeline Selection

The pipeline is selected:
1. **Per-call**: Via `pipeline` parameter in `/api/call` body
2. **Admin UI**: Dropdown in header persists to localStorage
3. **Default**: Falls back to `DEFAULT_PIPELINE` env var or `v0`
 
---
 
## Updating This File
 
**AI assistants are encouraged to update this file** when:
- Project structure changes
- New milestones are completed
- Architecture evolves
- New important context is discovered
 
Keep this file as the **single source of truth** for AI assistants working on Donna.
 
---
 
*Last updated: January 18, 2026 - v2.4 (Dual Pipeline: V0 Gemini / V1 Claude+Observer+ElevenLabs)*
