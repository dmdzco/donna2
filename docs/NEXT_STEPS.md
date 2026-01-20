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

### Latency Optimization Phase 2

**Full spec:** [LATENCY_OPTIMIZATION_PLAN.md](LATENCY_OPTIMIZATION_PLAN.md)

**Target:** Reduce response latency from ~600ms to ~300-400ms

| Optimization | Effort | Impact | Status |
|-------------|--------|--------|--------|
| Pre-warm Claude connection | Low | ~50-100ms | Pending |
| Pre-fetch senior memories | Medium | ~100ms | Pending |
| Cache common responses | Medium | ~500ms (10-20% of turns) | Pending |
| Parallel initialization | Low | ~50ms | Pending |
| Speculative TTS | High | ~100-200ms | Future |

**Pre-warm Claude Connection:**
- [ ] Create HTTPS keep-alive agent
- [ ] Pass agent to Anthropic client
- [ ] Test connection reuse across utterances

**Pre-fetch Senior Memories:**
- [ ] Add `getTopMemories()` to `services/memory.js`
- [ ] Call prefetch on session start (parallel with greeting)
- [ ] Inject pre-fetched memories into system prompt

**Cache Common Responses:**
- [ ] Create `pipelines/response-cache.js`
- [ ] Define patterns: "how are you", "good morning", "thank you"
- [ ] Add personalization (senior name, variety)
- [ ] Skip cache if observer signals present

**Alternative TTS (Future Testing):**
- [ ] Test Cartesia TTS (~50-100ms, native mulaw)
- [ ] Test Deepgram TTS (~100-200ms)
- [ ] Compare voice quality vs latency tradeoff
### Future Latency Improvements

**Potential optimizations:**
- [ ] **Dynamic Model Routing** - Use Haiku by default (~80ms vs Sonnet ~200ms)
- [ ] Test Cartesia TTS (~50-100ms) as ElevenLabs alternative
- [ ] Test Deepgram TTS (~100-200ms)
- [ ] Reduce Deepgram endpointing (500ms → 300ms)
- [ ] Keep TTS WebSocket open between utterances
- [ ] Cache common responses

**Target with all optimizations:** ~250ms time-to-first-audio (from current ~400ms)

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

## Documentation

| Doc | Purpose |
|-----|---------|
| [STREAMING_OBSERVER_SPEC.md](./STREAMING_OBSERVER_SPEC.md) | Streaming + multi-layer observer architecture |
| [DYNAMIC_MODEL_ROUTING.md](./DYNAMIC_MODEL_ROUTING.md) | Observer-driven Haiku/Sonnet selection |
| [architecture/OVERVIEW.md](./architecture/OVERVIEW.md) | System architecture overview |

---

*Last updated: January 2026 - v3.0 (4-Layer Observer + Dynamic Routing)*
