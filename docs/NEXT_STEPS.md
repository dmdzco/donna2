# Donna - Roadmap

## Current State (v3.1)

**Working Features:**
- Conversation Director Architecture
  - Layer 1: Quick Observer (0ms regex)
  - Layer 2: Conversation Director (Gemini 3 Flash, ~150ms)
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

### Cost Optimization: Telnyx Migration
**Goal:** Reduce telephony costs by ~65%

| Provider | Cost/min | Monthly (10 seniors) | Savings |
|----------|----------|---------------------|---------|
| Twilio | $0.02 | $90 | - |
| Telnyx | $0.007 | $31.50 | **$58.50/mo** |

- [ ] Evaluate Telnyx Media Streams API compatibility
- [ ] Test Telnyx WebSocket audio streaming
- [ ] Update webhook handlers for Telnyx format
- [ ] Migrate phone numbers or port existing
- [ ] A/B test call quality before full switch

---

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

### Prompt Caching (Anthropic)
**Goal:** Reduce Claude input token costs by ~90%

Cache static parts of system prompt, pay only 10% for cached reads.

| Component | Tokens | Cache? | Savings |
|-----------|--------|--------|---------|
| Base instructions | ~100 | Yes | 90 tokens/turn |
| Senior profile | ~100 | Yes | 90 tokens/turn |
| Static memories | ~400 | Yes | 360 tokens/turn |
| Director guidance | ~20 | No (dynamic) | - |
| Messages | ~500 | Partial | ~200 tokens/turn |

**Implementation:**
- [ ] Add `cache_control: { type: "ephemeral" }` to static system prompt parts
- [ ] Structure prompt as array of content blocks (cacheable + dynamic)
- [ ] Test cache hit rates in production
- [ ] Monitor cost reduction

**Estimated savings:** ~$0.04/call → **$1.20/mo per senior**

---

### Memory & Context Improvements
**Goal:** Smarter, more efficient context injection

**Current Issues:**
- Static + dynamic memories may overlap (duplicate injection)
- Raw transcript messages from previous calls (no summarization)
- No memory deduplication or relevance decay
- All memories treated equally regardless of recency/relevance

**Proposed Improvements:**

#### 1. Cross-Call Summary (not raw messages)
Instead of loading 6 raw messages from previous calls:
```
Current: "Hi Sarah!" / "I'm good, Tommy visited" / "That's nice!" / ...
Better:  "Last call (2 days ago): Discussed grandson Tommy's soccer game,
          mentioned knee feeling better. Mood: positive."
```
- [ ] Generate 1-2 sentence call summary at end of each call
- [ ] Store in `conversations.summary` (already exists)
- [ ] Inject summary instead of raw messages

#### 2. Memory Deduplication
- [ ] Hash memory content to detect duplicates
- [ ] Skip injecting memories already in static context
- [ ] Merge similar memories ("Tommy plays soccer" + "Tommy scored a goal" → combined)

#### 3. Tiered Memory Injection
| Tier | Type | Inject When |
|------|------|-------------|
| 1 - Critical | Health concerns, active reminders | Always |
| 2 - Contextual | Relevant to current topic | Semantic match > 0.7 |
| 3 - Background | General facts | First turn only |

- [ ] Add `tier` field to memories or compute from type/importance
- [ ] Only inject Tier 1 every turn, Tier 2-3 selectively

#### 4. Memory Decay
- [ ] Reduce effective importance based on age: `importance * decay(days_old)`
- [ ] Boost memories that get accessed frequently
- [ ] Archive old, unaccessed memories (don't delete, just exclude from search)

#### 5. Semantic Clustering
- [ ] Group related memories (all "Tommy" memories together)
- [ ] Inject cluster summary instead of individual entries
- [ ] "Family: Grandson Tommy (8, plays soccer), daughter Sarah (visits monthly)"

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
