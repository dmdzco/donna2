# Donna - Roadmap

## Current State (v2.5)

**Working Features:**
- Dual Pipeline Architecture (V0 Gemini / V1 Claude Streaming)
- Real-time voice calls via Twilio
- Admin dashboard with senior/reminder management
- Memory system with semantic search (pgvector)
- Scheduled reminder calls
- News updates via OpenAI web search
- Observability dashboard for call monitoring
- **V1 Streaming Pipeline** with multi-layer observers

---

## Recently Completed

### ✅ V1 Latency Optimization (January 2026)

**Achieved:** Reduced V1 greeting latency from ~1.5s to ~400ms

**Implemented:**
- [x] Pre-built greeting (skips Claude for initial hello)
- [x] Claude streaming responses (sentence-by-sentence)
- [x] ElevenLabs WebSocket TTS connection
- [x] Parallel Claude + TTS connection startup
- [x] Multi-layer observer architecture:
  - Layer 1 (0ms): Quick Observer - regex patterns for health/emotion
  - Layer 2 (~300ms): Fast Observer - Haiku + memory search
  - Layer 3 (~800ms): Deep Observer - Sonnet analysis (async)
- [x] `V1_STREAMING_ENABLED` feature flag for rollback

**New Files:**
- `adapters/elevenlabs-streaming.js` - WebSocket TTS
- `pipelines/quick-observer.js` - Layer 1 regex patterns
- `pipelines/fast-observer.js` - Layer 2 Haiku + tools

---

## Upcoming Work

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

### Future Latency Improvements

**Potential optimizations:**
- [ ] Test Cartesia TTS (~50-100ms) as ElevenLabs alternative
- [ ] Test Deepgram TTS (~100-200ms)
- [ ] Pre-warm Claude connection on call start
- [ ] Cache common responses

---

## Quick Reference

| Feature | Key Files |
|---------|-----------|
| V0 Pipeline | `gemini-live.js` |
| V1 Pipeline | `pipelines/v1-advanced.js` |
| Streaming TTS | `adapters/elevenlabs-streaming.js` |
| Quick Observer (L1) | `pipelines/quick-observer.js` |
| Fast Observer (L2) | `pipelines/fast-observer.js` |
| Deep Observer (L3) | `pipelines/observer-agent.js` |
| Memory System | `services/memory.js` |
| Scheduler | `services/scheduler.js` |
| Admin UI | `public/admin.html` |
| Observability | `apps/observability/` |

---

*Last updated: January 2026 - v2.5 (Streaming Pipeline)*
