# Donna - Product Plan & Feature Log

> **Last Updated:** January 20, 2026
> **Version:** 3.1 (Conversation Director Architecture)

---

## Executive Summary

**Donna** is an AI-powered companion that makes friendly phone calls to elderly individuals, providing daily check-ins, medication reminders, and companionship. The system combines real-time voice AI with long-term memory to create meaningful, personalized conversations.

**Target Users:**
- **Primary:** Seniors (70+) who live alone or have limited social contact
- **Secondary:** Caregivers (adult children, family members) who want peace of mind

**Core Value Proposition:**
- Combat loneliness through regular, warm conversations
- Ensure medication and appointment compliance
- Provide caregivers with insights into their loved one's wellbeing

---

## Feature Status Legend

| Status | Meaning |
|--------|---------|
| ✅ **Implemented** | Feature is live and working |
| 🔄 **Partial** | Feature exists but needs improvement |
| 📋 **Planned** | On the roadmap, not yet started |
| 💡 **Suggested** | Recommendation for future consideration |

---

## Core Features

### 1. Voice Calling System

#### 1.1 Outbound Calls ✅ **Implemented**
Donna can initiate phone calls to seniors at scheduled times or on-demand.
- **How it works:** API trigger → Twilio initiates call → Senior answers → AI conversation begins
- **Trigger methods:** Admin dashboard button, scheduled reminder, API call
- **Files:** `index.js`, `services/scheduler.js`

#### 1.2 Inbound Calls ✅ **Implemented**
Seniors can call Donna's phone number anytime to chat.
- **How it works:** Senior dials Twilio number → Webhook triggers → AI answers
- **Caller ID lookup:** Automatically identifies senior by phone number
- **Files:** `index.js` → `/voice/answer` webhook

#### 1.3 Call Status Tracking ✅ **Implemented**
Track call lifecycle from initiation to completion.
- **Statuses:** initiated, ringing, in-progress, completed, failed, no-answer, busy
- **Duration tracking:** Captured on call end
- **Files:** `index.js` → `/voice/status` webhook

#### 1.4 Browser-Based Calling ✅ **Implemented**
Test calls directly from browser without needing a phone.
- **How it works:** WebSocket audio streaming from browser microphone
- **Use case:** Development, demos, testing without Twilio costs
- **Files:** `browser-session.js`, `public/call.html`
- **URL:** `/browser-call`

---

### 2. Voice Pipeline Architecture

#### 2.1 V1 Pipeline (Claude + Conversation Director) ✅ **Implemented**
Production pipeline with 2-layer observer architecture and streaming.
- **Latency:** ~400ms time-to-first-audio (streaming)
- **Components:**
  - STT: Deepgram (real-time transcription)
  - LLM: Claude Sonnet 4 (streaming responses)
  - TTS: ElevenLabs WebSocket (streaming audio)
  - **Layer 1 - Quick Observer:** Instant regex analysis (0ms)
  - **Layer 2 - Conversation Director:** Gemini 3 Flash (~150ms)
  - **Post-Call:** Batch analysis for caregivers
- **Files:** `pipelines/v1-advanced.js`, `pipelines/quick-observer.js`, `pipelines/fast-observer.js`, `adapters/elevenlabs-streaming.js`

#### 2.2 Barge-In Support ✅ **Implemented**
User can interrupt Donna mid-sentence.
- **How it works:** Detects user speech → Stops audio playback → Clears queue → Processes new input
- **Prevents:** Backlog of responses, unnatural flow
- **Files:** `pipelines/v1-advanced.js` → `interruptSpeech()`

---

### 3. Memory System

#### 3.1 Semantic Memory Storage ✅ **Implemented**
Store facts about seniors as searchable vectors.
- **Storage:** PostgreSQL with pgvector extension
- **Embedding model:** OpenAI text-embedding-3-small (1536 dimensions)
- **Memory types:** fact, preference, event, concern, relationship
- **Fields:** content, type, importance (0-100), source, metadata
- **Files:** `services/memory.js`, `db/schema.js`

#### 3.2 Memory Extraction ✅ **Implemented**
Automatically extract memorable facts from conversations.
- **Trigger:** Call completion
- **Process:** GPT-4o-mini analyzes transcript → Returns structured memories → Stored with embeddings
- **Example extractions:**
  - "User's grandson is named Tommy"
  - "User prefers to take medication with breakfast"
  - "User mentioned feeling lonely on weekends"

#### 3.3 Semantic Search ✅ **Implemented**
Find relevant memories using natural language queries.
- **Algorithm:** Cosine similarity on vector embeddings
- **Threshold:** 0.7 minimum similarity
- **API:** `GET /api/seniors/:id/memories/search?q=...`

#### 3.4 Memory Context Building ✅ **Implemented**
Inject relevant memories into AI system prompt.
- **Pre-call:** Fetch important + recent memories before call starts
- **Includes:** Top 3 important, top 3 recent, topic-relevant if available
- **Files:** `services/memory.js` → `buildContext()`

#### 3.5 Mid-Call Memory Retrieval ✅ **Implemented**
Retrieve memories during active conversation via Conversation Director.
- **Triggers:** Semantic search on user's message each turn
- **Cooldown:** 20 seconds between retrievals
- **Files:** `pipelines/fast-observer.js` → memory search

#### 3.6 Manual Memory Entry ✅ **Implemented**
Caregivers can add memories manually via API or admin UI.
- **API:** `POST /api/seniors/:id/memories`
- **UI:** Memory section in senior edit modal

---

### 4. Reminder System

#### 4.1 Reminder Management ✅ **Implemented**
Create, update, and delete reminders for seniors.
- **Types:** medication, appointment, custom
- **Scheduling:** One-time or recurring (daily/weekly)
- **Fields:** title, description, scheduled time, recurrence
- **API:** Full CRUD at `/api/reminders`
- **UI:** Reminders tab in admin dashboard

#### 4.2 Scheduled Auto-Calls ✅ **Implemented**
Automatically call seniors when reminders are due.
- **Polling:** Every 60 seconds
- **Detection:** Matches scheduled time (non-recurring) or time-of-day + 23h since last (recurring)
- **Pre-fetch:** Builds context BEFORE calling Twilio (reduces latency)
- **Files:** `services/scheduler.js`

#### 4.3 Natural Reminder Delivery ✅ **Implemented**
Reminders are woven naturally into conversation, not announced robotically.
- **Prompt injection:** AI instructed to mention reminder naturally
- **Example:** "By the way, David, I wanted to remind you about your blood pressure medication. Have you had a chance to take it with breakfast today?"
- **Files:** `services/scheduler.js` → `formatReminderPrompt()`

---

### 5. Conversation Director (V1 Only) - 2-Layer + Post-Call Architecture

#### 5.1 Layer 1: Quick Observer ✅ **Implemented**
Instant regex-based analysis that affects the CURRENT response (0ms latency).
- **Health Detection:** 30+ patterns with severity levels (high/medium/low)
  - Pain, dizziness, falls, cardiovascular, fatigue, cognitive, appetite, medications
- **Family Patterns:** 25+ patterns covering all relationships + pets
- **Emotion Detection:** 25+ patterns with valence (positive/negative) and intensity
- **Safety Concerns:** Scams, strangers, emergencies, getting lost
- **Social/Activity/Time Patterns:** Friends, hobbies, memories, future plans
- **Token Recommendation:** Escalates max_tokens based on urgency
- **Files:** `pipelines/quick-observer.js`

#### 5.2 Layer 2: Conversation Director ✅ **Implemented**
Gemini 3 Flash analyzes conversation and provides proactive guidance (~150ms).
- **Call Phase Tracking:** opening → rapport → main → winding_down → closing
- **Topic Management:** stay_or_shift decisions, topic suggestions
- **Emotional Intelligence:** Tone detection, engagement monitoring
- **Reminder Timing:** Determines optimal moments for delivery
- **Token Recommendation:** 100-400 based on emotional needs
- **Files:** `pipelines/fast-observer.js` (Conversation Director)

#### 5.3 Post-Call Analysis ✅ **Implemented**
Batch analysis after call ends using Gemini Flash (replaces real-time deep observer).
- **Generates:**
  - Call summary (2-3 sentences)
  - Topics discussed
  - Engagement score (1-10)
  - Concerns for caregivers (high/medium/low priority)
  - Positive observations
  - Follow-up suggestions
  - Call quality rating
- **Storage:** `call_analyses` database table
- **Files:** `services/call-analysis.js`

#### 5.4 Guidance Injection ✅ **Implemented**
Layer signals feed into main LLM as hints.
- **Not mentioned explicitly:** Donna never says "my observer detected..."
- **Natural adaptation:** Based on phase, emotion, engagement signals
- **Files:** `pipelines/v1-advanced.js` → `buildSystemPrompt()`

#### 5.5 Call State Tracking ✅ **Implemented**
Tracks call progress for context-aware decisions.
- **Tracks:** minutesElapsed, callType, pendingReminders, remindersDelivered
- **Reminder Filtering:** Excludes already-delivered reminders
- **Files:** `pipelines/v1-advanced.js`

#### 5.6 Call Duration Management ✅ **Implemented**
Director recommends wrap-up timing based on conversation flow.
- **Natural endings:** Based on conversation phase, not hard timeout
- **Graceful:** Suggests wrap-up during `winding_down` phase

---

### 6. News & Context

#### 6.1 Interest-Based News ✅ **Implemented**
Fetch relevant news articles based on senior's interests.
- **Source:** OpenAI web search
- **Curation:** Filtered for positive, elderly-appropriate content
- **Caching:** 1-hour TTL per interest set
- **Integration:** Injected into system prompt as optional talking points
- **Files:** `services/news.js`

#### 6.2 Personalized System Prompts ✅ **Implemented**
Dynamic prompts built from senior profile data.
- **Includes:** Name, interests, medical notes, family info, memories, news, reminders
- **Tone:** Warm, patient, clear speech
- **Files:** `pipelines/v1-advanced.js`

---

### 7. Senior Profile Management

#### 7.1 Profile CRUD ✅ **Implemented**
Full create, read, update, delete operations for senior profiles.
- **Fields:** name, phone, timezone, interests, medical notes, family info, preferred call times
- **Phone normalization:** Handles various formats, stores last 10 digits
- **API:** `/api/seniors` endpoints
- **UI:** Seniors tab in admin dashboard

#### 7.2 Caller ID Lookup ✅ **Implemented**
Identify seniors automatically by incoming phone number.
- **Process:** Normalize incoming number → Query database → Load profile
- **Fallback:** Generic greeting if not found

---

### 8. Conversation History

#### 8.1 Transcript Storage ✅ **Implemented**
Store complete conversation transcripts.
- **Format:** JSON array of {role, content, timestamp}
- **Source:** Deepgram STT + Claude responses
- **Viewing:** Call detail modal in admin dashboard

#### 8.2 Call Metadata ✅ **Implemented**
Track call statistics and metadata.
- **Fields:** duration, status, start/end times, call SID
- **API:** `GET /api/conversations`, `GET /api/seniors/:id/conversations`

#### 8.3 Transcript Display 🔄 **Partial**
View transcripts in admin dashboard.
- **Current:** Basic display in modal
- **Issue:** Some calls missing transcripts (race condition on quick hangups)
- **Needed:** More robust transcript capture

---

### 9. Admin Dashboard

#### 9.1 Dashboard Tab ✅ **Implemented**
Overview statistics and quick access.
- **Stats:** Total seniors, calls today, upcoming reminders, active calls
- **Recent calls:** Last 5 calls with details
- **Upcoming reminders:** Next 24 hours

#### 9.2 Seniors Tab ✅ **Implemented**
Manage senior profiles and memories.
- **Features:** Add/edit/delete seniors, view memories, quick call button
- **Memory chips:** Visual display of stored memories by type

#### 9.3 Calls Tab ✅ **Implemented**
View call history and transcripts.
- **Features:** Call list with filters, transcript viewer, status badges

#### 9.4 Reminders Tab ✅ **Implemented**
Manage scheduled reminders.
- **Features:** Add/edit/delete reminders, recurring options, last delivered time

#### 9.5 Call Controls ✅ **Implemented**
Quick call buttons and call management.
- **Location:** Seniors tab, dashboard
- **Features:** One-click calling, status display

---

### 10. Audio Processing

#### 10.1 Format Conversion ✅ **Implemented**
Convert between Twilio and AI audio formats.
- **Twilio:** mulaw 8kHz mono
- **Gemini:** PCM 16kHz (input), 24kHz (output)
- **ElevenLabs:** PCM 24kHz
- **Files:** `audio-utils.js`

#### 10.2 Real-Time Streaming ✅ **Implemented**
Bidirectional audio streaming via WebSocket.
- **Chunk size:** 640 bytes (~80ms) for Twilio, 3200 bytes (~400ms) for barge-in
- **Protocol:** Twilio Media Streams

---

## Planned Features

### 11. V1 Latency Optimization ✅ **Implemented**
Reduced V1 pipeline latency from ~1.5s to ~400ms time-to-first-audio.

**Phase 1 (Architecture) - ✅ COMPLETE**
- [x] 2-Layer Observer Architecture (Quick → Director)
- [x] Non-blocking Director with Gemini 3 Flash (~150ms)
- [x] Post-call batch analysis (removed from real-time)
- [x] Dynamic token routing (100-400 based on context)

**Phase 2 (Streaming Pipeline) - ✅ COMPLETE**
- [x] Stream Claude responses sentence-by-sentence (`anthropic.messages.stream()`)
- [x] ElevenLabs WebSocket streaming TTS (`adapters/elevenlabs-streaming.js`)
- [x] Sentence boundary detection for TTS chunks
- [x] ~400ms time-to-first-audio achieved

**Phase 3 (Fine-Tuning) - 📋 PLANNED**
- [ ] Tune Deepgram endpointing (500ms → 300ms)
- [ ] Connection pooling for TTS

**Phase 4 (Alternative Providers) - 💡 FUTURE**
- [ ] Test Cartesia TTS (~50-100ms)
- [ ] Test Deepgram TTS (~100-200ms)
- [ ] Speculative execution
- [ ] Filler words for instant feedback

**Reference:** `docs/STREAMING_OBSERVER_SPEC.md`, `adapters/elevenlabs-streaming.js`

---

### 12. Caregiver Authentication 📋 **Planned**
Secure multi-user access with login system.

- **Provider:** Clerk (recommended)
- **Database additions:**
  ```sql
  caregivers (id, email, name, auth_id, created_at)
  caregiver_seniors (caregiver_id, senior_id)
  ```
- **Features:**
  - [ ] Login/logout UI
  - [ ] Protected API routes
  - [ ] Data filtering by caregiver assignment
  - [ ] Invite system for family members

---

### 13. Call Analysis Storage ✅ **Implemented**
Persist post-call analysis for caregiver review.

- **Database table:**
  ```sql
  call_analyses (
    id, conversation_id, senior_id,
    summary, topics, engagement_score,
    concerns, positive_observations,
    follow_up_suggestions, call_quality,
    created_at
  )
  ```
- **Features:**
  - [x] Store comprehensive analysis after each call
  - [x] Engagement score (1-10) with trend tracking
  - [x] Concerns with priority levels (high/medium/low)
  - [x] Positive observations for caregivers
  - [x] Follow-up suggestions
- **Planned Enhancements:**
  - [ ] Display in caregiver dashboard
  - [ ] Weekly summary emails
  - [ ] Trend visualization over time

---

### 14. Analytics Dashboard 📋 **Planned**
Insights and trends for caregivers.

- **Metrics:**
  - [ ] Call frequency per senior
  - [ ] Average call duration trends
  - [ ] Engagement level over time
  - [ ] Reminder delivery success rate
  - [ ] Concern frequency and categories

---

## Suggested Features

### 15. Proactive Wellness Check-Ins 💡 **Suggested**
Donna initiates calls based on patterns, not just reminders.

- **Triggers:**
  - No call in X days (loneliness detection)
  - Missed medication reminders
  - Previous call showed low engagement
  - Weather alerts in senior's area
- **Value:** Catches issues before they escalate

---

### 16. Family Call Summaries 💡 **Suggested**
Automated email/SMS summaries to caregivers after calls.

- **Content:**
  - Call duration and time
  - Key topics discussed
  - Any concerns flagged by Observer
  - Medication compliance status
- **Frequency:** After each call or daily digest
- **Privacy:** Opt-in, configurable detail level

---

### 17. Voice Cloning for Familiar Voices 💡 **Suggested**
Use ElevenLabs voice cloning so Donna sounds like a family member.

- **Process:** Family member records sample → Clone created → Used for TTS
- **Value:** More familiar, comforting experience for senior
- **Consideration:** Ethical guidelines, consent requirements

---

### 18. Emergency Detection & Alerts 💡 **Suggested**
Detect potential emergencies and alert caregivers immediately.

- **Triggers:**
  - Phrases like "I fell", "can't breathe", "chest pain"
  - Extended silence after distress
  - Confusion about identity or location
- **Actions:**
  - Immediate caregiver notification (SMS/call)
  - Optional: Contact emergency services
  - Log incident for review

---

### 19. Multi-Language Support 💡 **Suggested**
Support seniors who speak languages other than English.

- **Priority languages:** Spanish, Mandarin, Hindi
- **Components to update:**
  - Deepgram STT (supports 30+ languages)
  - Claude (multilingual)
  - ElevenLabs (multilingual voices available)
  - System prompts (translation needed)

---

### 20. Medication Tracking Integration 💡 **Suggested**
Connect with smart pill dispensers or pharmacy systems.

- **Integrations:**
  - Hero, PillPack, CVS Caremark APIs
  - Smart pill bottle sensors
- **Features:**
  - Auto-create reminders from prescription data
  - Confirm actual medication taking (not just reminder delivery)
  - Alert caregiver on missed doses

---

### 21. Caregiver Mobile App 💡 **Suggested**
Native mobile app for caregivers (iOS/Android).

- **Features:**
  - Push notifications for concerns/calls
  - Quick call trigger
  - View transcripts and summaries
  - Manage reminders on-the-go
- **Tech:** React Native or Flutter

---

### 22. Conversation Continuity 💡 **Suggested**
Resume previous conversation topics naturally.

- **How it works:**
  - Track "open threads" (topics mentioned but not resolved)
  - On next call, Donna references: "Last time you mentioned your grandson's soccer game - how did that go?"
- **Storage:** Add `conversation_threads` table
- **Value:** Deeper, more meaningful relationships

---

### 23. Mood Tracking & Visualization 💡 **Suggested**
Track emotional state over time from Observer data.

- **Display:** Calendar heatmap of mood
- **Trends:** "Tends to be tired on Mondays"
- **Alerts:** Sustained low mood triggers caregiver notification
- **Value:** Early depression/decline detection

---

### 24. Group Calls 💡 **Suggested**
Include multiple participants (senior + family member).

- **Use cases:**
  - Family check-in with Donna facilitating
  - Doctor appointment recap with caregiver
- **Tech:** Twilio conference calling
- **Donna's role:** Facilitator, note-taker, reminder of topics

---

### 25. Offline Voice Messages 💡 **Suggested**
Leave voice messages when senior doesn't answer.

- **Current:** Call fails silently on no-answer
- **Enhancement:**
  - Detect voicemail
  - Leave personalized message: "Hi David, this is Donna. I wanted to remind you about your medication. Call me back anytime!"
  - Log attempt for retry

---

### 26. Activity Suggestions 💡 **Suggested**
Donna suggests activities based on interests and weather.

- **Examples:**
  - "It's a beautiful day - perfect for a walk in the garden"
  - "Your favorite team plays tonight at 7"
  - "There's a new documentary about WW2 on Netflix"
- **Data sources:** Weather API, sports schedules, streaming services
- **Value:** Combat boredom, encourage activity

---

### 27. Cognitive Exercises 💡 **Suggested**
Simple brain games during calls.

- **Types:**
  - Word association
  - Memory recall ("What did you have for breakfast?")
  - Simple math
  - Trivia on interests
- **Tracking:** Score trends over time (cognitive decline detection)
- **Delivery:** Optional, only if senior enjoys them

---

### 28. Integration with Smart Home 💡 **Suggested**
Connect with Alexa, Google Home, smart displays.

- **Features:**
  - "Alexa, call Donna" triggers check-in
  - Video calls on smart displays
  - Smart home status in context ("I see your thermostat is set low")
- **APIs:** Alexa Skills Kit, Google Actions

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| **3.1** | Jan 20, 2026 | Conversation Director architecture (2-layer + post-call), extensive Quick Observer regex, post-call analysis |
| **2.5** | Jan 20, 2026 | Barge-in support, queue clearing, streaming pipeline |
| **2.4** | Jan 18, 2026 | Claude + Observer + ElevenLabs pipeline |
| **2.3** | Jan 16, 2026 | Scheduled reminder calls with auto-trigger |
| **2.2** | Jan 15, 2026 | Enhanced admin dashboard (4 tabs) |
| **2.1** | Jan 14, 2026 | Deepgram STT, mid-call memory, news updates |
| **2.0** | Jan 12, 2026 | Full voice calls with memory system |
| **1.0** | Jan 10, 2026 | Basic Twilio integration |

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DONNA SYSTEM v3.1                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │   Senior's   │    │    Admin     │    │   Browser    │           │
│  │    Phone     │    │  Dashboard   │    │  Test Call   │           │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘           │
│         │ PSTN              │ HTTP              │ WebSocket         │
│         ▼                   ▼                   ▼                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Express Server                            │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │    │
│  │  │   Twilio    │  │  Pipeline   │  │  Scheduler  │          │    │
│  │  │  Webhooks   │  │             │  │   (60s)     │          │    │
│  │  └─────────────┘  └──────┬──────┘  └─────────────┘          │    │
│  └──────────────────────────┼──────────────────────────────────┘    │
│                             │                                        │
│                             ▼                                        │
│       ┌────────────────────────────────────────────────────┐        │
│       │           VOICE PIPELINE (Claude + Director)       │        │
│       │                                                    │        │
│       │  ┌─────────────────────────────────────────────┐   │        │
│       │  │ LAYER 1: Quick Observer                     │   │        │
│       │  │ Regex patterns (0ms) - health, emotion, etc │   │        │
│       │  └───────────────────┬─────────────────────────┘   │        │
│       │                      ▼                             │        │
│       │  ┌─────────────────────────────────────────────┐   │        │
│       │  │ LAYER 2: Conversation Director              │   │        │
│       │  │ Gemini 3 Flash (~150ms)                     │   │        │
│       │  │ Call phase, emotion, reminder timing        │   │        │
│       │  └───────────────────┬─────────────────────────┘   │        │
│       │                      ▼                             │        │
│       │  Deepgram STT → Claude Sonnet (streaming)          │        │
│       │              → ElevenLabs WebSocket TTS            │        │
│       │                                                    │        │
│       │  Latency: ~400ms time-to-first-audio               │        │
│       └────────────────────────────────────────────────────┘        │
│                             │                                        │
│              ┌──────────────┴──────────────┐                        │
│              │   POST-CALL ANALYSIS        │                        │
│              │   Gemini Flash (batch)      │                        │
│              │   Summary, concerns, score  │                        │
│              └─────────────────────────────┘                        │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    PostgreSQL (Neon)                           │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────┐│  │
│  │  │ seniors │  │memories │  │ conver- │  │reminders│  │ call ││  │
│  │  │         │  │(pgvector│  │ sations │  │         │  │analys││  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └──────┘│  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Business Considerations

### Pricing Model (Suggested)
| Tier | Price | Seniors | Calls/Month | Features |
|------|-------|---------|-------------|----------|
| **Starter** | $29/mo | 1 | 30 | Basic calls, reminders |
| **Family** | $79/mo | 3 | 100 | + Memory, transcripts |
| **Care** | $149/mo | 10 | 500 | + Observer, analytics |
| **Enterprise** | Custom | Unlimited | Unlimited | + API, integrations |

### Cost Structure (15-minute call estimate)

**Assumptions:** 15-min call, ~20 conversational exchanges, ~1,000 chars TTS output

| Component | Calculation | Cost |
|-----------|-------------|------|
| Twilio Voice | 15 min × $0.02/min | $0.30 |
| Deepgram STT | 15 min × $0.0043/min | $0.065 |
| Claude Sonnet 4 | ~20 exchanges, ~12k tokens | ~$0.08 |
| ElevenLabs TTS | ~1,000 chars (short responses) | ~$0.18 |
| Gemini 3 Flash (Director) | ~20 calls × ~1.2k tokens | ~$0.01 |
| Gemini Flash (Post-Call) | 1 analysis, ~5k tokens | ~$0.005 |
| OpenAI Embeddings | Memory search + storage | ~$0.01 |
| **Total per call** | | **~$0.65** |
| **Monthly (30 calls)** | | **~$19.50** |
| **Monthly (10 seniors)** | | **~$195** |

**Primary cost drivers:** Twilio (46%) + ElevenLabs TTS (28%)

### Key Metrics to Track
- **Engagement:** Average call duration, calls per senior per week
- **Retention:** Senior churn rate, caregiver satisfaction
- **Quality:** Concern flags, sentiment trends
- **Compliance:** Reminder delivery rate, medication adherence

---

## Appendix: File Reference

| Feature Area | Key Files |
|--------------|-----------|
| Main Server | `index.js` |
| Voice Pipeline | `pipelines/v1-advanced.js` |
| Layer 1: Quick Observer | `pipelines/quick-observer.js` |
| Layer 2: Conversation Director | `pipelines/fast-observer.js` |
| Post-Call Analysis | `services/call-analysis.js` |
| ElevenLabs TTS (REST) | `adapters/elevenlabs.js` |
| ElevenLabs TTS (Streaming) | `adapters/elevenlabs-streaming.js` |
| Audio Utils | `audio-utils.js` |
| Memory | `services/memory.js` |
| Seniors | `services/seniors.js` |
| Conversations | `services/conversations.js` |
| Scheduler | `services/scheduler.js` |
| News | `services/news.js` |
| Database Schema | `db/schema.js` |
| Admin UI | `public/admin.html` |
| Browser Call | `public/call.html`, `browser-session.js` |

---

*This is a living document. Update as features are added or plans change.*
