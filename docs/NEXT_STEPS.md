# Donna - Next Steps Roadmap

> **Focus for Next Session**: V1 Pipeline Testing + Caregiver Authentication

## Current State (v2.4 - Dual Pipeline)

**Working:**
- **Dual Pipeline Architecture** - V0 (Gemini) and V1 (Claude+Observer) selectable from admin
- Real-time voice calls (Twilio Media Streams)
- Enhanced admin dashboard (4 tabs: Dashboard, Seniors, Calls, Reminders)
- Senior profiles + PostgreSQL database
- Memory system (storage, semantic search, extraction at call end)
- Conversation history with transcripts
- User speech transcription (Deepgram STT)
- Mid-conversation memory retrieval (triggers on keywords)
- News updates via OpenAI web search
- Scheduled reminder calls (auto-triggers when reminders due)
- **V1 Pipeline Components:**
  - Observer Agent (analyzes conversation every 30s)
  - Claude Sonnet for response generation
  - ElevenLabs TTS

**Next Priority:** V1 Pipeline Testing → Caregiver Authentication

---

## Completed Steps

### Step 1: User Speech Transcription (Deepgram) ✅ COMPLETE
- Deepgram SDK integration for real-time STT
- Memory trigger detection on keywords
- Mid-call memory injection

### Step 2: News/Weather Updates ✅ COMPLETE
- OpenAI web search API for news
- Interest-based, cached 1 hour

### Step 3: Scheduled Call System ✅ COMPLETE
- `services/scheduler.js` with 60-second polling
- Reminder context injection into calls

### Step 4: Admin Dashboard ✅ COMPLETE
- 4-tab interface: Dashboard, Seniors, Calls, Reminders
- Stats cards, recent calls, upcoming reminders
- Create/edit/delete seniors and reminders
- Memory management in senior edit modal
- **Pipeline selector** in header

### Step 5: Dual Pipeline (V0/V1) ✅ COMPLETE
- V0: Gemini 2.5 Flash Native Audio (default)
- V1: Deepgram STT → Claude + Observer → ElevenLabs TTS
- Observer Agent runs every 30 seconds
- Pipeline selectable per-call from admin UI

---

## Next Steps

### Step 6: V1 Pipeline Testing ← CURRENT PRIORITY
**Goal:** Validate V1 pipeline works end-to-end

**Testing Checklist:**
1. [ ] Set required env vars: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY`
2. [ ] Select V1 from admin dropdown
3. [ ] Trigger call to test number
4. [ ] Verify Deepgram receives and transcribes audio
5. [ ] Verify Claude generates appropriate responses
6. [ ] Verify ElevenLabs produces audio that plays through Twilio
7. [ ] Verify Observer Agent logs to console every 30s
8. [ ] Compare call quality with V0

**Test:** Complete a 2-minute conversation on V1, verify transcript, check logs.

---

### Step 6.5: V1 Latency Optimization
**Goal:** Reduce V1 latency from ~1.5s to <600ms

**See full plan:** [docs/plans/2026-01-18-v1-latency-optimization.md](./plans/2026-01-18-v1-latency-optimization.md)

**Phase 1 - Quick Wins (1.5s → ~800ms):**
- [ ] Switch Claude Sonnet → Haiku
- [ ] Tune Deepgram endpointing (500ms → 300ms)
- [ ] Implement streaming TTS

**Phase 2 - Streaming Pipeline (~800ms → ~500ms):**
- [ ] Stream Claude responses (sentence-by-sentence)
- [ ] ElevenLabs WebSocket connection
- [ ] Make Observer non-blocking

**Phase 3 - Alternative Providers (~500ms → ~350ms):**
- [ ] Test Cartesia TTS (~50-100ms)
- [ ] Test Deepgram TTS (~100-200ms)
- [ ] Test Gemini Flash text mode (~200ms)

**Phase 4 - Advanced:**
- [ ] Speculative execution
- [ ] Filler words for instant feedback
- [ ] Response caching

---

### Step 7: Caregiver Authentication
**Goal:** Secure multi-user access with login

**Tasks:**
1. Choose auth provider (Clerk recommended)
2. Create caregiver table in database
3. Link caregivers to seniors (many-to-many)
4. Protect API routes with authentication middleware
5. Filter data to show only assigned seniors

**Database additions:**
```sql
caregivers (id, email, name, auth_id, created_at)
caregiver_seniors (caregiver_id, senior_id)
```

**Test:** Log in as caregiver, only see assigned seniors.

---

### Step 8: Observer Signal Storage
**Goal:** Store observer analysis for caregiver review

**Tasks:**
1. Add `observer_signals` table to database
2. Store signals after each observer analysis
3. Display concerns in call transcript view
4. Add concerns summary to dashboard

**Schema:**
```sql
observer_signals (
  id, conversation_id,
  engagement_level, emotional_state,
  concerns, created_at
)
```

---

### Step 9: Analytics Dashboard
**Goal:** Insights for caregivers

**Metrics to track:**
- Call frequency per senior
- Average call duration
- Engagement trends over time
- Reminder delivery success rate
- Concern frequency

---

## Visual Roadmap

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Step 1: Deepgram STT ✅ DONE                          │
│  Step 2: News Updates ✅ DONE                          │
│  Step 3: Scheduled Calls ✅ DONE                       │
│  Step 4: Admin Dashboard ✅ DONE                       │
│  Step 5: Dual Pipeline ✅ DONE                         │
│              ↓                                          │
│  Step 6: V1 Pipeline Testing ← CURRENT PRIORITY        │
│  └── "Validate Claude + Observer + ElevenLabs"         │
│              ↓                                          │
│  Step 6.5: V1 Latency Optimization                     │
│  └── "Reduce 1.5s → <600ms"                            │
│      Phase 1: Haiku + tuned Deepgram + streaming TTS   │
│      Phase 2: Full streaming pipeline                  │
│      Phase 3: Cartesia/Deepgram TTS alternatives       │
│              ↓                                          │
│  Step 7: Caregiver Login                               │
│  └── "Secure multi-user access"                        │
│              ↓                                          │
│  Step 8: Observer Signal Storage                       │
│  └── "Store and display concerns"                      │
│              ↓                                          │
│  Step 9: Analytics Dashboard                           │
│  └── "Engagement trends and insights"                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Reference: Files by Feature

| Feature | Key Files |
|---------|-----------|
| V0 Pipeline (Gemini) | `gemini-live.js` |
| V1 Pipeline (Claude) | `pipelines/v1-advanced.js` |
| Observer Agent | `pipelines/observer-agent.js` |
| ElevenLabs TTS | `adapters/elevenlabs.js` |
| Pipeline Router | `index.js` (WebSocket handler) |
| Audio conversion | `audio-utils.js` |
| Memory system | `services/memory.js` |
| News updates | `services/news.js` |
| Scheduled calls | `services/scheduler.js` |
| Senior profiles | `services/seniors.js` |
| Database schema | `db/schema.js` |
| Admin UI | `public/admin.html` |

---

## Environment Variables

```bash
# ============ REQUIRED (Both Pipelines) ============
PORT=3001
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
DATABASE_URL=...
OPENAI_API_KEY=...          # Embeddings + news

# ============ V0 PIPELINE ============
GOOGLE_API_KEY=...          # Gemini 2.5 Flash

# ============ V1 PIPELINE ============
ANTHROPIC_API_KEY=...       # Claude Sonnet
ELEVENLABS_API_KEY=...      # TTS
DEEPGRAM_API_KEY=...        # STT (also used by V0 for memory triggers)

# ============ OPTIONAL ============
DEFAULT_PIPELINE=v0         # v0 or v1

# ============ FUTURE: AUTH ============
CLERK_SECRET_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
```

---

*Last updated: January 18, 2026 - v2.4 (Dual Pipeline + Latency Optimization Plan)*
