# Remaining Work

## Current Focus

Follow the milestones in [INCREMENTAL_BUILD_GUIDE.md](../INCREMENTAL_BUILD_GUIDE.md).

## Next Milestones

### Milestone 2: Gemini Voice
- Add Google AI SDK
- Connect Twilio audio to Gemini
- Basic AI conversation

### Milestone 3: WebSocket Streaming
- Real-time audio streaming
- Bidirectional conversation

### Milestone 4: Outbound Calls
- Donna initiates calls to seniors
- Twilio credentials required

## Phase B (Milestones 7-10)

After completing Phase A voice features:

- **Milestone 7**: Add Neon database + Drizzle ORM
- **Milestone 8**: Senior profiles + reminders
- **Milestone 9**: Scheduled calls with Upstash
- **Milestone 10**: Call history + recordings

## Phase C (Milestones 11-15)

Full architecture with:

- **Milestone 11**: Migrate to Claude + Deepgram + ElevenLabs
- **Milestone 12**: Observer Agent for conversation quality
- **Milestone 13**: Memory & Context with pgvector
- **Milestone 14**: Analytics dashboard
- **Milestone 15**: Clerk authentication + caregiver portal

## Reference

See these docs for Phase C implementation details:
- [Phase 1 Reference](PHASE1_COMPLETE.md) - Voice infrastructure
- [Phase 2 Reference](PHASE2_COMPLETE.md) - Database & scheduling
- [Phase 3 Reference](PHASE3_COMPLETE.md) - AI features
