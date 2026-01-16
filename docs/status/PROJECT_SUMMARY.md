# Donna Project Summary

AI-powered senior companion with voice calls.

## Current Status

**Building incrementally** - Starting with simple Gemini voice, adding complexity milestone by milestone.

See [INCREMENTAL_BUILD_GUIDE.md](../INCREMENTAL_BUILD_GUIDE.md) for the full roadmap.

## Build Phases

| Phase | Milestones | Status | Features |
|-------|------------|--------|----------|
| **A** | 1-6 | In Progress | Twilio + Gemini native voice |
| **B** | 7-10 | Planned | Database, reminders, scheduling |
| **C** | 11-15 | Planned | Claude stack, memory, analytics |

## Current Milestone: 1 - Hello World

Simple Twilio webhook that plays a greeting.

```
Phone → Twilio → Express Server → TwiML → "Hello!"
```

## Target Architecture (Phase C)

The full system includes:

**Business Modules:**
- Senior Profiles
- Voice Pipeline (Deepgram STT + ElevenLabs TTS)
- Conversation Manager
- Reminder Management
- Scheduler Service
- Observer Agent
- Memory & Context (pgvector)
- Analytics Engine

**External Adapters:**
- Claude AI (conversation)
- Deepgram (speech-to-text)
- ElevenLabs (text-to-speech)
- Twilio (phone calls)
- Cloud Storage (recordings)
- OpenAI (embeddings)

**Infrastructure:**
- Neon (PostgreSQL)
- Upstash Redis (job queue)
- Clerk (authentication)
- Railway (deployment)

## Reference Documentation

These docs describe what will be built in later milestones:

- [Phase 1 Reference](PHASE1_COMPLETE.md) - Voice infrastructure (Milestone 11)
- [Phase 2 Reference](PHASE2_COMPLETE.md) - Database & scheduling (Milestones 7-10)
- [Phase 3 Reference](PHASE3_COMPLETE.md) - AI features (Milestones 12-14)
- [Architecture Overview](../architecture/OVERVIEW.md) - Full system design
