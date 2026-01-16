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

Current priority: **Step 2 - Scheduled Calls** (make reminders trigger automated calls)

### Quick Summary of Next Steps:
1. ~~**Deepgram STT**~~ - **DONE** (mid-call memory retrieval unlocked)
2. **Scheduled Calls** - Reminders trigger automated calls
3. **Admin Dashboard** - Full visibility and management
4. **Caregiver Login** - Secure multi-user access
5. **News Updates** - Richer conversations with current info
6. **ElevenLabs TTS** - Production voice quality

---

## Current Status: v2.1 (Deepgram STT Added)

### Working Features
- Real-time voice calls (Twilio + Gemini 2.5 Native Audio)
- Bidirectional audio streaming via WebSocket
- AI transcription of Donna's speech (Gemini output transcription)
- **User speech transcription (Deepgram STT)** - NEW
- **Mid-conversation memory retrieval** - NEW (triggers on keywords like "daughter", "doctor", etc.)
- Senior profile management with database
- Memory storage with semantic embeddings (pgvector + OpenAI)
- Memory extraction from conversations
- Admin UI for managing seniors

### Environment Setup
Requires `DEEPGRAM_API_KEY` in environment for user speech transcription.
Without it, calls still work but mid-call memory retrieval is disabled.

---

## Current Architecture (v2.1)

**Status**: This is what's actually running today.

```
┌─────────────────────────────────────────────────────────┐
│                    CURRENT STACK                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   Senior's Phone                                        │
│        │                                                │
│        ▼                                                │
│   ┌─────────┐                                          │
│   │ Twilio  │  ← Phone calls (inbound/outbound)        │
│   └────┬────┘                                          │
│        │ Media Streams (WebSocket)                     │
│        ▼                                                │
│   ┌─────────────────┐                                  │
│   │  Express Server │  ← index.js (root directory)     │
│   │   (Railway)     │                                  │
│   └────┬────────────┘                                  │
│        │                                                │
│   ┌────┴────────────────────────┐                      │
│   │                             │                      │
│   ▼                             ▼                      │
│   ┌─────────────────┐    ┌─────────────┐              │
│   │ Gemini 2.5 Flash│    │  Deepgram   │              │
│   │  (Native Voice) │    │   (STT)     │              │
│   │  AI + TTS       │    │ Transcribes │              │
│   └────┬────────────┘    │ user speech │              │
│        │                 └──────┬──────┘              │
│        │                        │                      │
│        │            ┌───────────┘                      │
│        │            ▼                                  │
│        │    ┌───────────────┐                         │
│        │    │Memory Triggers│ ← Mid-call retrieval    │
│        │    └───────────────┘                         │
│        ▼                                               │
│   ┌─────────────────┐                                  │
│   │   PostgreSQL    │  ← Neon (pgvector for memories)  │
│   └─────────────────┘                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Current Flow
1. Twilio initiates/receives call, connects via Media Streams WebSocket
2. Audio streams bidirectionally through Express server
3. User audio → Deepgram (STT) for transcription → triggers memory retrieval
4. User audio → Gemini 2.5 Flash (native voice) for AI response
5. Gemini audio response → sent back through Twilio to caller
6. Memories extracted at call end, stored with embeddings

### Current Tech Stack
| Component | Technology | Notes |
|-----------|------------|-------|
| **Hosting** | Railway | Auto-deploy from GitHub |
| **Phone** | Twilio | Voice calls, Media Streams WebSocket |
| **AI** | Gemini 2.5 Flash | Native voice (audio in, audio out) |
| **STT** | Deepgram | User speech transcription for memory triggers |
| **TTS** | Gemini Native | Built into Gemini's audio output |
| **Database** | Neon PostgreSQL | pgvector for semantic memory search |
| **Embeddings** | OpenAI | For memory similarity search |
 
### Key Files (EDIT THESE)
```
/
├── index.js              ← MAIN SERVER (Express + WebSocket)
├── gemini-live.js        ← Gemini native audio session handler
├── services/
│   ├── seniors.js        ← Senior profile CRUD
│   ├── memory.js         ← Memory storage + retrieval
│   └── conversations.js  ← Conversation records
├── db/
│   └── schema.js         ← Database schema (Drizzle ORM)
├── public/
│   └── admin.html        ← Admin UI
├── package.json
└── railway.json
```
 
---
 
## Planned Architecture (Phase C - Production)
 
**Status**: NOT YET IMPLEMENTED. The `reference/` directory contains code from a failed previous attempt. Use for learning only.
 
```
┌─────────────────────────────────────────────────────────┐
│                   PLANNED STACK                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ┌─────────────────┐      ┌──────────────────┐        │
│   │Caregiver Portal │      │   Senior's Phone │        │
│   │    (Next.js)    │      └────────┬─────────┘        │
│   └────────┬────────┘               │                  │
│            │                        │                  │
│            ▼                        ▼                  │
│   ┌─────────────────────────────────────────┐          │
│   │          Express API Server             │          │
│   └─────────────────┬───────────────────────┘          │
│                     │                                   │
│         ┌───────────┼───────────┐                      │
│         ▼           ▼           ▼                      │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│   │ Deepgram │ │  Claude  │ │ElevenLabs│              │
│   │  (STT)   │ │  (LLM)   │ │  (TTS)   │              │
│   └──────────┘ └──────────┘ └──────────┘              │
│         │           │           │                      │
│         └───────────┼───────────┘                      │
│                     ▼                                   │
│   ┌─────────────────────────────────────────┐          │
│   │              Modules                     │          │
│   │  • Voice Pipeline    • Observer Agent   │          │
│   │  • Conversation Mgr  • Memory System    │          │
│   │  • Call Orchestrator • Analytics        │          │
│   │  • Reminder System   • Skills System    │          │
│   └─────────────────┬───────────────────────┘          │
│                     ▼                                   │
│   ┌─────────────────────────────────────────┐          │
│   │           Infrastructure                 │          │
│   │  • Neon (PostgreSQL + pgvector)         │          │
│   │  • Upstash Redis (Job Queue)            │          │
│   │  • Clerk (Authentication)               │          │
│   │  • Vercel Blob (Audio Storage)          │          │
│   └─────────────────────────────────────────┘          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```
 
### Why Migrate Later?
| Aspect | Current (Gemini) | Planned (Claude Stack) |
|--------|------------------|------------------------|
| **Latency** | 1 API call | 3 API calls (higher latency) |
| **Setup** | 1 API key | 4+ API keys |
| **Voice Quality** | Good | Production-grade |
| **Customization** | Limited | Full control |
| **Cost** | Free tier | Pay per service |
| **Memory** | In-session only | Long-term with pgvector |
 
---
 
## Development Phases

| Phase | Status | What's Included |
|-------|--------|-----------------|
| **A** | ✅ **COMPLETE** | Gemini voice, WebSocket streaming, outbound calls |
| **B** | ✅ **COMPLETE** | Database, senior profiles, memory system, Deepgram STT |
| **C** | 🔄 **IN PROGRESS** | Scheduled calls, admin dashboard, caregiver auth |
| **D** | Planned | News updates, ElevenLabs TTS, analytics |

### Completed Milestones
1. ✅ Twilio voice integration
2. ✅ Gemini 2.5 native audio (bidirectional WebSocket)
3. ✅ Outbound calls via API
4. ✅ PostgreSQL + pgvector for memories
5. ✅ Senior profile management
6. ✅ Memory extraction from conversations
7. ✅ Deepgram STT for user transcription
8. ✅ Mid-call memory retrieval (keyword triggers)

### Next Up (Phase C)
- ⬜ **Scheduled Calls** - Reminders trigger automated calls
- ⬜ Admin Dashboard - Full management UI
- ⬜ Caregiver Authentication - Secure multi-user access
 
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
| Change voice/conversation behavior | Root `index.js` or `gemini-voice.js` |
| Modify system prompt | Root Gemini code (NOT `reference/`) |
| Add new feature | Root directory files |
| Understand target architecture | `reference/` (read-only reference) |
| Check deployment config | `railway.json`, `.env.example` |
 
### Common Mistakes
1. ❌ Editing `reference/modules/` thinking it's active code
2. ❌ Assuming Claude or ElevenLabs are in use (Deepgram IS active for STT)
3. ❌ Looking at `reference/llm-conversation/` for current prompts
4. ❌ Treating `reference/` test counts as current project status
 
### Environment Variables (Current)
```bash
# Required
PORT=3001
GOOGLE_API_KEY=...          # Gemini API
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
DATABASE_URL=...            # Neon PostgreSQL
OPENAI_API_KEY=...          # For embeddings

# Optional (but recommended)
DEEPGRAM_API_KEY=...        # User speech transcription
```
 
---
 
## Updating This File
 
**AI assistants are encouraged to update this file** when:
- Project structure changes
- New milestones are completed
- Architecture evolves
- New important context is discovered
 
Keep this file as the **single source of truth** for AI assistants working on Donna.
 
---
 
*Last updated: January 16, 2026 - v2.1 (Deepgram STT complete)*
