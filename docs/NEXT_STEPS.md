# Donna - Roadmap

## Current State (v2.4)

**Working Features:**
- Dual Pipeline Architecture (V0 Gemini / V1 Claude+Observer)
- Real-time voice calls via Twilio
- Admin dashboard with senior/reminder management
- Memory system with semantic search (pgvector)
- Scheduled reminder calls
- News updates via OpenAI web search
- Observability dashboard for call monitoring

---

## Upcoming Work

### V1 Latency Optimization
**Goal:** Reduce V1 latency from ~1.5s to <600ms

See full plan: [docs/plans/2026-01-18-v1-latency-optimization.md](./plans/2026-01-18-v1-latency-optimization.md)

**Quick Wins:**
- [ ] Switch Claude Sonnet → Haiku for faster responses
- [ ] Tune Deepgram endpointing (500ms → 300ms)
- [ ] Implement streaming TTS

**Streaming Pipeline:**
- [ ] Stream Claude responses sentence-by-sentence
- [ ] ElevenLabs WebSocket connection
- [ ] Make Observer non-blocking

**Alternative Providers:**
- [ ] Test Cartesia TTS (~50-100ms)
- [ ] Test Deepgram TTS (~100-200ms)

---

### Caregiver Authentication
**Goal:** Secure multi-user access

- [ ] Integrate Clerk authentication
- [ ] Create caregiver-senior relationships
- [ ] Filter data by assigned seniors
- [ ] Protect API routes

---

### Observer Signal Storage
**Goal:** Store observer analysis for caregiver review

- [ ] Add observer_signals table
- [ ] Display concerns in call view
- [ ] Add concerns summary to dashboard

---

### Analytics Dashboard
**Goal:** Insights for caregivers

- [ ] Call frequency per senior
- [ ] Average call duration trends
- [ ] Engagement metrics over time
- [ ] Concern frequency tracking

---

## Quick Reference

| Feature | Key Files |
|---------|-----------|
| V0 Pipeline | `gemini-live.js` |
| V1 Pipeline | `pipelines/v1-advanced.js` |
| Observer Agent | `pipelines/observer-agent.js` |
| ElevenLabs TTS | `adapters/elevenlabs.js` |
| Memory System | `services/memory.js` |
| Scheduler | `services/scheduler.js` |
| Admin UI | `public/admin.html` |
| Observability | `apps/observability/` |

---

*Last updated: January 2026*
