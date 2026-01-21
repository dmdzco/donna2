# Donna - Roadmap

## Current State (v3.1)

**Working Features:**
- Conversation Director Architecture
  - Layer 1: Quick Observer (0ms regex)
  - Layer 2: Conversation Director (Gemini 3 Flash, ~150ms)
  - Layer 3: Post-Turn Agent (background)
  - Post-Call Analysis (async batch)
- Dynamic Token Routing (100-400 tokens based on context)
- Streaming Pipeline (~600ms time-to-first-audio)
- Real-time voice calls via Twilio
- Admin dashboard with senior/reminder management
- Memory system with semantic search (pgvector)
- Scheduled reminder calls with tracking
- News updates via OpenAI web search
- Observability dashboard for call monitoring

---

## Recently Completed

### ✅ Conversation Director (January 2026)

**Achieved:** Proactive call guidance that steers conversation flow, manages reminders, and monitors engagement.

**Implemented:**
- [x] Rewrote `fast-observer.js` as Conversation Director
- [x] Uses Gemini 3 Flash (~100-150ms latency)
- [x] Call phase tracking (opening → rapport → main → closing)
- [x] Topic transition suggestions with natural phrases
- [x] Reminder delivery timing (won't deliver during emotional moments)
- [x] Engagement monitoring with re-engagement strategies
- [x] Token recommendations (100-400) based on context
- [x] Filters out already-delivered reminders

**Director Output:**
```javascript
{
  analysis: { call_phase, engagement_level, emotional_tone },
  direction: { stay_or_shift, next_topic, transition_phrase },
  reminder: { should_deliver, which_reminder, delivery_approach },
  guidance: { tone, priority_action, specific_instruction },
  model_recommendation: { max_tokens, reason }
}
```

---

### ✅ Post-Call Analysis (January 2026)

**Achieved:** Async batch analysis when call ends.

**Implemented:**
- [x] Created `services/call-analysis.js`
- [x] Uses Gemini Flash for cost efficiency (~$0.0005/call)
- [x] Generates call summary, engagement score, concerns
- [x] Detects health/cognitive/emotional/safety concerns
- [x] Saves to `call_analyses` database table
- [x] Flags high-severity concerns for caregiver notification

---

### ✅ Dynamic Model Routing (January 2026)

**Achieved:** Automatic token adjustment based on conversation context.

**Implemented:**
- [x] `selectModelConfig()` uses Director + Quick Observer
- [x] Token range: 100 (default) to 400 (emotional support)
- [x] Simplified from Haiku/Sonnet switching to token-based

**Token Selection:**
| Situation | Tokens | Trigger |
|-----------|--------|---------|
| Normal conversation | 100 | Default |
| Health mention | 150 | Quick Observer |
| Emotional support | 200-250 | Director |
| Low engagement | 200 | Director |
| Reminder delivery | 150 | Director |

---

### ✅ Post-Turn Agent - Layer 3 (January 2026)

**Achieved:** Background processing after response is sent.

**Implemented:**
- [x] `pipelines/post-turn-agent.js`
- [x] Health concern extraction for caregiver alerts
- [x] Automatic memory extraction from conversations
- [x] Topic prefetching for anticipated discussions
- [x] Fire-and-forget execution (non-blocking)

---

### ✅ V1 Streaming Pipeline (January 2026)

**Achieved:** Reduced greeting latency from ~1.5s to ~600ms

**Implemented:**
- [x] Pre-generated greeting (skips Claude for initial hello)
- [x] Claude streaming responses (sentence-by-sentence)
- [x] ElevenLabs WebSocket TTS connection
- [x] Parallel Claude + TTS connection startup
- [x] `V1_STREAMING_ENABLED` feature flag

---

## Upcoming Work

### Caregiver Authentication
**Goal:** Secure multi-user access

- [ ] Integrate Clerk authentication
- [ ] Create caregiver-senior relationships
- [ ] Filter data by assigned seniors
- [ ] Protect API routes

---

### Call Analysis Dashboard
**Goal:** Display post-call analysis for caregivers

- [ ] Add call analysis view to admin dashboard
- [ ] Show engagement scores over time
- [ ] Display concerns with severity levels
- [ ] Follow-up suggestions for next call
- [ ] Alert notifications for high-severity concerns

---

### Caregiver Notifications
**Goal:** Alert caregivers about concerns

- [ ] SMS notifications via Twilio
- [ ] Email notifications
- [ ] Configurable alert thresholds
- [ ] Daily/weekly summary digests

---

### Reminder Analytics
**Goal:** Track reminder effectiveness

- [ ] Reminder delivery success rate
- [ ] Acknowledgment tracking
- [ ] Missed reminder patterns
- [ ] Optimal delivery time analysis

---

### Latency Optimization Phase 2

**Target:** Reduce response latency from ~600ms to ~400ms

| Optimization | Effort | Impact | Status |
|-------------|--------|--------|--------|
| Pre-warm Claude connection | Low | ~50-100ms | Pending |
| Pre-fetch senior memories | Medium | ~100ms | Pending |
| Cache common responses | Medium | ~500ms (10-20% of turns) | Pending |
| Test Cartesia TTS | Medium | ~100-200ms | Future |

---

## Quick Reference

| Feature | Key Files |
|---------|-----------|
| Main Pipeline | `pipelines/v1-advanced.js` |
| Streaming TTS | `adapters/elevenlabs-streaming.js` |
| Quick Observer (L1) | `pipelines/quick-observer.js` |
| Conversation Director (L2) | `pipelines/fast-observer.js` |
| Post-Turn Agent (L3) | `pipelines/post-turn-agent.js` |
| Post-Call Analysis | `services/call-analysis.js` |
| Token Selection | `v1-advanced.js` (selectModelConfig) |
| Memory System | `services/memory.js` |
| Scheduler | `services/scheduler.js` |
| Admin UI | `public/admin.html` |
| Observability | `apps/observability/` |

## Documentation

| Doc | Purpose |
|-----|---------|
| [CONVERSATION_DIRECTOR_SPEC.md](./CONVERSATION_DIRECTOR_SPEC.md) | Director specification and examples |
| [architecture/OVERVIEW.md](./architecture/OVERVIEW.md) | System architecture overview |
| [STREAMING_OBSERVER_SPEC.md](./STREAMING_OBSERVER_SPEC.md) | Streaming + observer architecture |

---

*Last updated: January 2026 - v3.1 (Conversation Director)*
