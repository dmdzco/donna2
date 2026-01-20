# Donna - Roadmap

## Current State (v3.0)

**Working Features:**
- 4-Layer Observer Architecture
- Dynamic Model Routing (Haiku ↔ Sonnet)
- Streaming Pipeline (~400ms time-to-first-audio)
- Real-time voice calls via Twilio
- Admin dashboard with senior/reminder management
- Memory system with semantic search (pgvector)
- Scheduled reminder calls
- News updates via OpenAI web search
- Observability dashboard for call monitoring

---

## Recently Completed

### ✅ Dynamic Model Routing (January 2026)

**Achieved:** Automatic Haiku/Sonnet selection based on conversation context.

**Implemented:**
- [x] `modelRecommendation` output in all 3 observers
- [x] `selectModelConfig()` function in v1-advanced.js
- [x] Priority: Quick > Fast > Deep (most urgent first)
- [x] Logging: `Model: Haiku/Sonnet (reason), tokens: N`

**Triggers:**
| Situation | Model | Tokens |
|-----------|-------|--------|
| Normal conversation | Haiku | 75 |
| Health mention | Sonnet | 150 |
| Emotional support | Sonnet | 150 |
| Low engagement | Sonnet | 120 |
| Simple question | Haiku | 60 |

---

### ✅ Post-Turn Agent - Layer 4 (January 2026)

**Achieved:** Background processing after response is sent.

**Implemented:**
- [x] `pipelines/post-turn-agent.js`
- [x] Health concern extraction for caregiver alerts
- [x] Automatic memory extraction from conversations
- [x] Topic prefetching for anticipated discussions
- [x] Fire-and-forget execution (non-blocking)

---

### ✅ V1 Streaming Pipeline (January 2026)

**Achieved:** Reduced greeting latency from ~1.5s to ~400ms

**Implemented:**
- [x] Pre-built greeting (skips Claude for initial hello)
- [x] Claude streaming responses (sentence-by-sentence)
- [x] ElevenLabs WebSocket TTS connection
- [x] Parallel Claude + TTS connection startup
- [x] 3-layer observer architecture
- [x] `V1_STREAMING_ENABLED` feature flag

---

### ✅ Haiku Default Model (January 2026)

**Achieved:** Switched main conversation model from Sonnet to Haiku.

- [x] Faster responses (~300ms vs ~800ms first token)
- [x] Cost reduction (~10x cheaper per token)
- [x] Dynamic upgrade to Sonnet when needed

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
- [ ] Reduce Deepgram endpointing (500ms → 300ms)
- [ ] Keep TTS WebSocket open between utterances
- [ ] Cache common responses

---

## Quick Reference

| Feature | Key Files |
|---------|-----------|
| Main Pipeline | `pipelines/v1-advanced.js` |
| Streaming TTS | `adapters/elevenlabs-streaming.js` |
| Quick Observer (L1) | `pipelines/quick-observer.js` |
| Fast Observer (L2) | `pipelines/fast-observer.js` |
| Deep Observer (L3) | `pipelines/observer-agent.js` |
| Post-Turn Agent (L4) | `pipelines/post-turn-agent.js` |
| Model Selection | `v1-advanced.js` (selectModelConfig) |
| Memory System | `services/memory.js` |
| Scheduler | `services/scheduler.js` |
| Admin UI | `public/admin.html` |
| Observability | `apps/observability/` |

---

*Last updated: January 2026 - v3.0 (4-Layer Observer + Dynamic Routing)*
