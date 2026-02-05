# Product Feature Todos

> Implemented: 40 | Partial: 2 | Planned: 14 | Suggested: 14

---

## Status Legend

| Icon | Status |
|------|--------|
| Done | Implemented and working |
| Partial | Exists but needs improvement |
| Planned | On the roadmap, not yet started |
| Suggested | Future consideration |

---

## Priority Queue (Product Only)

| # | Item | Priority | Effort | Impact |
|---|------|----------|--------|--------|
| 1 | Telnyx Migration | P0 | 2 weeks | Save $58.50/mo (65% telephony cost reduction) |
| 2 | Greeting Rotation System | P1 | 3 days | More natural conversations |
| 3 | In-Call Reminder Tracking | P1 | 3 days | Prevent duplicate reminders |
| 4 | Cross-Call Reminder Tracking | P1 | 1 week | Prevent harmful duplicates |
| 5 | Caregiver Authentication | P1 | 1 week | Multi-user access (depends: arch-phase-7) |
| 6 | Post-Call Reminder Verification | P2 | 1 week | Ensure reminder delivery |
| 7 | Call Analysis Dashboard | P2 | 2 weeks | Caregiver insights |
| 8 | Caregiver Notifications | P2 | 1 week | Alerts for concerns |
| 9 | In-Call Web Search | P2 | 1 week | Answer current events questions |
| 10 | Improved Call End Guidance | P2 | 3 days | Natural conversation endings |
| 11 | Reminder Analytics | P3 | 1 week | Track effectiveness |
| 12 | Prompt Caching (Anthropic) | P3 | 3 days | Save ~$1.20/mo per senior |
| 13 | Latency Optimization Phase 2 | P3 | 2 weeks | Target ~400ms |
| 14 | Graceful Call Ending | P3 | 3 days | Programmatic hang-up |

---

## Cost Optimization

### Telnyx Migration
- id: prod-telnyx
- status: planned
- priority: P0
- effort: 2 weeks
- impact: Save $58.50/mo on 10 seniors (65% telephony cost reduction)

**Current vs Target:**
| Provider | Cost/min | Monthly (10 seniors) |
|----------|----------|---------------------|
| Twilio | $0.02 | $90 |
| Telnyx | $0.007 | $31.50 |

**Tasks:**
- [ ] Evaluate Telnyx Media Streams API compatibility
- [ ] Test Telnyx WebSocket audio streaming
- [ ] Update webhook handlers for Telnyx format
- [ ] Migrate phone numbers or port existing
- [ ] A/B test call quality before full switch

---

### Prompt Caching (Anthropic)
- id: prod-prompt-cache
- status: planned
- priority: P3
- effort: 3 days
- impact: Save ~$1.20/mo per senior (~90% input token cost reduction)

**Cacheable components:**
| Component | Tokens | Cache? |
|-----------|--------|--------|
| Base instructions | ~100 | Yes |
| Senior profile | ~100 | Yes |
| Static memories | ~400 | Yes |
| Director guidance | ~20 | No (dynamic) |

**Tasks:**
- [ ] Add `cache_control: { type: "ephemeral" }` to static system prompt parts
- [ ] Structure prompt as array of content blocks (cacheable + dynamic)
- [ ] Test cache hit rates in production
- [ ] Monitor cost reduction

---

## Reminder System Improvements

### In-Call Reminder Tracking
- id: prod-incall-reminder
- status: planned
- priority: P1
- effort: 3 days
- files: `pipelines/v1-advanced.js`

**Problem:** Donna might repeat reminders within a single call.

**Tasks:**
- [ ] Track `remindersDeliveredThisCall` in V1AdvancedSession
- [ ] Director checks delivered list before recommending reminder
- [ ] Mark reminder as delivered when acknowledgment detected
- [ ] Pass delivered list to Director on each turn
- [ ] Log reminder delivery events for observability

---

### Cross-Call Reminder Tracking
- id: prod-crosscall-reminder
- status: planned
- priority: P1
- effort: 1 week
- files: `services/reminders.js`, `db/schema.js`

**Problem:** If Donna gives a reminder in the morning, she shouldn't repeat it in the afternoon without acknowledging.

**Bad:** "Remember to water your succulent" (again)
**Good:** "This morning I reminded you to water your succulent - did you get a chance?"

**Tasks:**
- [ ] Use `reminderDeliveries` table to track attempts
- [ ] Check if reminder was delivered in recent calls (24hr window)
- [ ] Detect acknowledgment patterns in Quick Observer
- [ ] Update delivery status (pending → delivered → acknowledged)
- [ ] Prevent re-delivery of already-acknowledged reminders

---

### Post-Call Reminder Verification
- id: prod-reminder-verify
- status: planned
- priority: P2
- effort: 1 week
- files: `services/call-analysis.js`

**Problem:** No way to know if critical reminders were actually delivered.

**Tasks:**
- [ ] Post-call analysis checks if pending reminders were mentioned
- [ ] Compare `pendingReminders` vs transcript for delivery confirmation
- [ ] If reminder not delivered, mark for retry
- [ ] Schedule follow-up call for missed critical reminders
- [ ] Configurable retry policy (max attempts, delay between)
- [ ] Alert caregiver if reminder repeatedly missed

---

### Reminder Analytics
- id: prod-reminder-analytics
- status: planned
- priority: P3
- effort: 1 week
- files: New analytics service

**Tasks:**
- [ ] Reminder delivery success rate
- [ ] Acknowledgment tracking
- [ ] Missed reminder patterns
- [ ] Optimal delivery time analysis

---

## Conversation Quality

### Greeting Rotation System
- id: prod-greetings
- status: planned
- priority: P1
- effort: 3 days
- files: `pipelines/v1-advanced.js`, `services/greetings.js`

**Problem:** Same greeting every call feels robotic.

**Tasks:**
- [ ] Pre-generate 6 different greeting variations per senior
- [ ] Cache greetings with ElevenLabs TTS
- [ ] Rotate through greetings throughout the day
- [ ] Include time-of-day awareness (morning/afternoon/evening)
- [ ] Personalize with recent context (last call summary)

---

### Improved Call End Guidance
- id: prod-call-ending
- status: planned
- priority: P2
- effort: 3 days
- files: `pipelines/fast-observer.js`

**Problem:** Conversations sometimes end abruptly.

**Tasks:**
- [ ] Enhance Director's closing phase detection
- [ ] Add transition phrases for graceful endings
- [ ] Summarize key points before goodbye
- [ ] Confirm any action items (medication taken, appointments noted)
- [ ] Warm sign-off that references next call

---

### Graceful Call Ending
- id: prod-graceful-end
- status: planned
- priority: P3
- effort: 3 days
- files: `pipelines/v1-advanced.js`

**Problem:** Donna can't programmatically end calls.

**Triggers:**
- Conversation Director detects closing phase complete
- Senior indicates goodbye
- Call duration reaches reasonable limit

**Tasks:**
- [ ] Add Twilio API call to end conversation
- [ ] Trigger after final goodbye detected
- [ ] Prevent awkward silences at end
- [ ] Log call termination reason

---

### In-Call Web Search
- id: prod-web-search
- status: planned
- priority: P2
- effort: 1 week
- files: `pipelines/fast-observer.js`, `services/search.js`

**Use cases:** Answer questions about current events, weather, sports scores.

**Tasks:**
- [ ] Integrate OpenAI web search tool into Director pipeline
- [ ] Detect when senior asks about current events/news/weather
- [ ] Run search in parallel (don't block response)
- [ ] Inject search results into next turn's context
- [ ] Cache results to avoid duplicate searches

---

## Caregiver Experience

### Caregiver Authentication
- id: prod-caregiver-auth
- status: planned
- priority: P1
- effort: 1 week
- depends_on: arch-phase-7
- files: `apps/admin/`, `middleware/auth.js`

**Note:** Backend auth is done. This is frontend integration.

**Tasks:**
- [ ] Add Clerk React to admin dashboard
- [ ] Create login/logout UI
- [ ] Protect admin routes
- [ ] Filter data by assigned seniors
- [ ] Create invite system for family members

---

### Call Analysis Dashboard
- id: prod-analysis-dashboard
- status: planned
- priority: P2
- effort: 2 weeks
- depends_on: prod-caregiver-auth
- files: `apps/admin/src/pages/Analytics.tsx`

**Tasks:**
- [ ] Add call analysis view to admin dashboard
- [ ] Show engagement scores over time (chart)
- [ ] Display concerns with severity levels
- [ ] Follow-up suggestions for next call
- [ ] Alert notifications for high-severity concerns

---

### Caregiver Notifications
- id: prod-notifications
- status: planned
- priority: P2
- effort: 1 week
- depends_on: prod-caregiver-auth
- files: `services/notifications.js`

**Tasks:**
- [ ] SMS notifications via Twilio
- [ ] Email notifications
- [ ] Configurable alert thresholds
- [ ] Daily/weekly summary digests

---

## Performance

### Latency Optimization Phase 2
- id: prod-latency-p2
- status: planned
- priority: P3
- effort: 2 weeks
- files: `pipelines/v1-advanced.js`, `adapters/*`

**Target:** Reduce response latency from ~600ms to ~400ms

| Optimization | Effort | Impact |
|-------------|--------|--------|
| Pre-warm Claude connection | Low | ~50-100ms |
| Pre-fetch senior memories | Medium | ~100ms |
| Cache common responses | Medium | ~500ms (10-20% of turns) |
| Test Cartesia TTS | Medium | ~100-200ms |

**Tasks:**
- [ ] Pre-warm Claude connection on call start
- [ ] Pre-fetch senior memories before first turn
- [ ] Implement response caching for common patterns
- [ ] Test Cartesia TTS as ElevenLabs alternative

---

## Suggested Features (Backlog)

Not prioritized. Evaluate when bandwidth allows.

| Feature | Category | Notes |
|---------|----------|-------|
| Proactive wellness check-ins | Safety | Trigger calls based on patterns, missed reminders |
| Family call summaries | Caregiver | Email/SMS summaries after each call |
| Voice cloning | Personalization | Donna sounds like family member |
| Emergency detection & alerts | Safety | Detect "I fell", chest pain, confusion |
| Multi-language support | Accessibility | Spanish, Mandarin, Hindi priority |
| Medication tracking integration | Health | Connect to smart pill dispensers |
| Caregiver mobile app | Caregiver | iOS/Android native app |
| Conversation continuity | Memory | Resume open topics across calls |
| Mood tracking & visualization | Health | Calendar heatmap of emotional state |
| Group calls | Social | Senior + family member together |
| Offline voice messages | Reliability | Leave voicemail on no-answer |
| Activity suggestions | Engagement | Weather/interest-based suggestions |
| Cognitive exercises | Health | Word games, memory recall, trivia |
| Smart home integration | Convenience | Alexa, Google Home connection |

---

## Recently Completed (January 2026)

### Conversation Director Architecture (Done)
- Layer 1: Quick Observer (0ms regex)
- Layer 2: Conversation Director (Gemini 3 Flash, ~150ms)
- Post-Call Analysis (async batch)
- Call phase tracking, engagement monitoring, reminder timing

### V1 Streaming Pipeline (Done)
- Claude streaming responses (sentence-by-sentence)
- ElevenLabs WebSocket TTS
- ~600ms time-to-first-audio achieved
- Pre-generated greetings

### Dynamic Token Routing (Done)
- Token range: 100-400 based on context
- Quick Observer + Director recommendations

### Post-Call Analysis (Done)
- Call summary, engagement score, concerns
- Stored in `call_analyses` table
- High-severity concern flagging

### Memory & Context Improvements (Done)
- Cross-call summaries (not raw messages)
- Memory deduplication (cosine > 0.9)
- Tiered memory injection
- Memory decay (30-day half-life)

### Conversation Balance (Done)
- Interest usage guidelines (don't lead with interests)
- Question frequency limits (max 2 consecutive)

---

## Summary

| Category | Count |
|----------|-------|
| Implemented | 40 |
| Partial | 2 |
| Planned | 14 |
| Suggested | 14 |

---

*Migrated from NEXT_STEPS.md (deleted). See [PRODUCT_PLAN.md](../PRODUCT_PLAN.md) for feature descriptions.*
