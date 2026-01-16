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

Current priority: **Step 1 - Deepgram STT** (user speech transcription to unlock mid-call memory retrieval)

### Quick Summary of Next Steps:
1. **Deepgram STT** - Mid-call memory retrieval unlocked
2. **Scheduled Calls** - Reminders trigger automated calls
3. **Admin Dashboard** - Full visibility and management
4. **Caregiver Login** - Secure multi-user access
5. **News Updates** - Richer conversations with current info
6. **ElevenLabs TTS** - Production voice quality

---

## Current Status: v2.0 (Production Ready)

### Working Features
- Real-time voice calls (Twilio + Gemini 2.5 Native Audio)
- Bidirectional audio streaming via WebSocket
- AI transcription of Donna's speech (output transcription)
- Senior profile management with database
- Memory storage with semantic embeddings (pgvector + OpenAI)
- Memory extraction from conversations
- Admin UI for managing seniors

### Known Limitation
- User speech transcription not available (Gemini SDK bug)
- Mid-conversation memory retrieval blocked until user transcription is resolved
- **Planned Fix:** Deepgram integration for user speech transcription (Step 1 - current priority)

---

## Current Architecture (v2.0)
 
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
│        │                                                │
│        ▼                                                │
│   ┌─────────────────┐                                  │
│   │  Express Server │  ← index.js (root directory)     │
│   │   (Railway)     │                                  │
│   └────┬────────────┘                                  │
│        │                                                │
│        ▼                                                │
│   ┌─────────────────┐                                  │
│   │ Gemini 2.5 Flash│  ← AI conversation engine        │
│   │  (Native Voice) │                                  │
│   └────┬────────────┘                                  │
│        │                                                │
│        ▼                                                │
│   ┌─────────────────┐                                  │
│   │   AWS Polly     │  ← Text-to-speech (via Twilio)   │
│   │  (Twilio <Say>) │                                  │
│   └─────────────────┘                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```
 
### Current Flow
1. Twilio initiates/receives call
2. `<Gather speech>` captures senior's voice (Twilio's built-in STT)
3. Gemini 2.5 Flash generates response
4. `<Say voice="Polly.Joanna">` speaks response (Twilio's TTS)
5. Loop continues until goodbye detected
 
### Current Tech Stack
| Component | Technology | Notes |
|-----------|------------|-------|
| **Hosting** | Railway | Auto-deploy from GitHub |
| **Phone** | Twilio | Voice calls, webhooks |
| **AI** | Gemini 2.5 Flash | Single API, native voice support |
| **STT** | Twilio `<Gather>` | Built-in, no extra API |
| **TTS** | AWS Polly (via Twilio) | `<Say>` verb with SSML |
 
### Key Files (EDIT THESE)
```
donna2/
├── index.js              ← MAIN SERVER
├── gemini-voice.js       ← Gemini session handler (if exists)
├── package.json
├── .env
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
 
| Phase | Milestones | Status | What It Adds |
|-------|------------|--------|--------------|
| **A** | 1-6 | **CURRENT** | Gemini voice, basic calls, goodbye detection |
| **B** | 7-10 | Planned | Database, senior profiles, reminders, scheduling |
| **C** | 11-15 | Planned | Claude, Deepgram, ElevenLabs, memory, analytics |
 
### Phase A Milestones (Current Focus)
1. ✅ Hello World - Twilio answers, plays TTS
2. 🔄 Gemini Response - AI generates greeting
3. ⬜ Voice Conversation - Real-time via WebSocket
4. ⬜ Outbound Calls - Donna initiates calls
5. ⬜ Conversation Memory - In-session context
6. ⬜ Goodbye Detection - Natural call ending
 
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
2. ❌ Assuming Claude/Deepgram/ElevenLabs are in use
3. ❌ Looking at `reference/llm-conversation/` for current prompts
4. ❌ Treating `reference/` test counts as current project status
 
### Environment Variables (Current)
```bash
PORT=3001
GOOGLE_API_KEY=your_gemini_key
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
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
 
*Last updated: January 2026*
