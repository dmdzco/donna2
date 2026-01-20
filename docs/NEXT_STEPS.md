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

### Dynamic Model Routing (Observer-Driven)
**Goal:** Use Haiku by default, upgrade to Sonnet only when observers request it

**Spec:** [docs/DYNAMIC_MODEL_ROUTING.md](./DYNAMIC_MODEL_ROUTING.md)

**Philosophy:** Let the AI decide when it needs more AI.

```
Default: Haiku (~80ms, 100 tokens) - 90% of turns
Upgrade: Sonnet (~200ms, 200-400 tokens) - when observers say so
```

**Implementation:**
- [ ] Add `modelRecommendation` output to quick-observer.js
- [ ] Add complexity detection to fast-observer.js (Haiku decides if Sonnet needed)
- [ ] Add `model_recommendation` to observer-agent.js output
- [ ] Create `pipelines/model-selector.js` for central routing logic
- [ ] Update v1-advanced.js to use dynamic model selection
- [ ] Add product feature flags (storytelling_mode, news_discussion, etc.)
- [ ] Log routing decisions to conversation log for observability

**Observer-driven triggers for Sonnet:**
- Health/safety concerns detected
- Emotional distress (strong negative emotion)
- Complex question requiring detailed answer
- Low engagement - needs re-engagement
- Storytelling or memory discussion requested

**Product features that request Sonnet:**
| Feature | Max Tokens |
|---------|------------|
| Storytelling Mode | 400 |
| News Discussion | 300 |
| Reminder Delivery | 250 |
| Memory Lane | 300 |
| Health Check-in | 200 |

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

### Future Latency Improvements

**Potential optimizations:**
- [ ] **Dynamic Model Routing** - Use Haiku by default (~80ms vs Sonnet ~200ms)
- [ ] Test Cartesia TTS (~50-100ms) as ElevenLabs alternative
- [ ] Test Deepgram TTS (~100-200ms)
- [ ] Pre-warm Claude connection on call start
- [ ] Cache common responses

**Target with all optimizations:** ~250ms time-to-first-audio (from current ~400ms)

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
| Model Selector | `pipelines/model-selector.js` (planned) |
| Memory System | `services/memory.js` |
| Scheduler | `services/scheduler.js` |
| Admin UI | `public/admin.html` |
| Observability | `apps/observability/` |

## Documentation

| Doc | Purpose |
|-----|---------|
| [STREAMING_OBSERVER_SPEC.md](./STREAMING_OBSERVER_SPEC.md) | Streaming + multi-layer observer architecture |
| [DYNAMIC_MODEL_ROUTING.md](./DYNAMIC_MODEL_ROUTING.md) | Observer-driven Haiku/Sonnet selection |
| [architecture/OVERVIEW.md](./architecture/OVERVIEW.md) | System architecture overview |

---

*Last updated: January 2026 - v2.5 (Streaming Pipeline)*
