# Donna - Product Plan & Feature Log

> **Last Updated:** January 20, 2026
> **Version:** 2.5 (Dual Pipeline with Barge-In)

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

### 2. Dual Pipeline Architecture

#### 2.1 V0 Pipeline (Gemini Native) ✅ **Implemented**
Low-latency pipeline using Google's Gemini 2.5 Flash with native audio.
- **Latency:** ~300-500ms
- **Components:** Gemini handles STT + LLM + TTS in one API
- **Voice:** Aoede (warm female)
- **Best for:** Quick, responsive conversations
- **Files:** `gemini-live.js`

#### 2.2 V1 Pipeline (Claude + Observer) ✅ **Implemented**
Advanced pipeline with separate components for more control and quality.
- **Latency:** ~1.5s (target: <600ms after optimization)
- **Components:**
  - STT: Deepgram (real-time transcription)
  - LLM: Claude Sonnet 4 (conversation)
  - TTS: ElevenLabs (Rachel voice)
  - Observer: Claude analyzing conversation every 30s
- **Best for:** Higher quality responses, conversation insights
- **Files:** `pipelines/v1-advanced.js`, `pipelines/observer-agent.js`, `adapters/elevenlabs.js`

#### 2.3 Pipeline Selection ✅ **Implemented**
Choose pipeline per-call from admin UI or API.
- **Default:** Configurable via `DEFAULT_PIPELINE` env var (currently v1)
- **Override:** Pass `pipeline: "v0"` or `pipeline: "v1"` in API call
- **UI:** Dropdown selector in admin dashboard header

#### 2.4 Barge-In Support (V1) ✅ **Implemented**
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

#### 3.5 Mid-Call Memory Retrieval ✅ **Implemented** (V0 only)
Retrieve memories during active conversation based on keywords.
- **Triggers:** "remember", "forgot", "last time", "doctor", "medicine", family names
- **Cooldown:** 20 seconds between retrievals
- **Files:** `gemini-live.js` → memory trigger system

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

### 5. Observer Agent (V1 Only)

#### 5.1 Conversation Analysis ✅ **Implemented**
Parallel agent analyzes conversation quality every 30 seconds.
- **Analyzes:**
  - Engagement level (high/medium/low)
  - Emotional state (happy, confused, tired, distressed)
  - Reminder timing (is now a good moment?)
  - Topic suggestions (if conversation stalls)
  - End call signals (natural wrap-up points)
  - Concerns (issues for caregiver)
- **Files:** `pipelines/observer-agent.js`

#### 5.2 Guidance Injection ✅ **Implemented**
Observer signals feed into main LLM as hints.
- **Not mentioned explicitly:** Donna never says "my observer detected..."
- **Natural adaptation:** "You seem a bit tired today, shall we chat another time?"
- **Files:** `pipelines/v1-advanced.js` → `buildSystemPrompt()`

#### 5.3 Concern Flagging ✅ **Implemented** (Logging only)
Observer detects potential issues and logs them.
- **Current:** Logged to console for debugging
- **Examples:** "Senior seems confused about date", "Mentioned feeling dizzy"
- **Future:** Store in database for caregiver dashboard

#### 5.4 Call Duration Management ✅ **Implemented**
Enforce maximum call duration with graceful endings.
- **Default max:** 15 minutes
- **Warning:** At 80% (12 min), signal to wrap up
- **Force end:** At 120% (18 min)

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
- **Files:** `gemini-live.js`, `pipelines/v1-advanced.js`

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
- **Source:** V0 (Gemini transcription), V1 (Deepgram + Claude)
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

#### 9.5 Pipeline Selector ✅ **Implemented**
Switch between V0 and V1 pipelines.
- **Location:** Header dropdown
- **Persistence:** Saved to localStorage

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

### 11. V1 Latency Optimization 📋 **Planned**
Reduce V1 pipeline latency from ~1.5s to <600ms.

**Phase 1 (Quick Wins) - Target: ~800ms**
- [ ] Switch Claude Sonnet → Haiku
- [ ] Tune Deepgram endpointing (500ms → 300ms)
- [ ] Implement streaming TTS

**Phase 2 (Streaming Pipeline) - Target: ~500ms**
- [ ] Stream Claude responses sentence-by-sentence
- [ ] ElevenLabs WebSocket connection
- [ ] Make Observer fully non-blocking

**Phase 3 (Alternative Providers) - Target: ~350ms**
- [ ] Test Cartesia TTS (~50-100ms)
- [ ] Test Deepgram TTS (~100-200ms)
- [ ] Consider Gemini Flash text mode

**Phase 4 (Advanced)**
- [ ] Speculative execution
- [ ] Filler words for instant feedback
- [ ] Response caching for common phrases

**Reference:** `docs/plans/2026-01-18-v1-latency-optimization.md`

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

### 13. Observer Signal Storage 📋 **Planned**
Persist observer analysis for caregiver review.

- **Database table:**
  ```sql
  observer_signals (
    id, conversation_id,
    engagement_level, emotional_state,
    concerns, created_at
  )
  ```
- **Features:**
  - [ ] Store signals after each 30s analysis
  - [ ] Display concerns in call transcript view
  - [ ] Concerns summary on dashboard
  - [ ] Trend analysis over time

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
| **2.5** | Jan 20, 2026 | Barge-in support, queue clearing, V1 as default |
| **2.4** | Jan 18, 2026 | Dual pipeline (V0 Gemini / V1 Claude+Observer+ElevenLabs) |
| **2.3** | Jan 16, 2026 | Scheduled reminder calls with auto-trigger |
| **2.2** | Jan 15, 2026 | Enhanced admin dashboard (4 tabs) |
| **2.1** | Jan 14, 2026 | Deepgram STT, mid-call memory, news updates |
| **2.0** | Jan 12, 2026 | Full voice calls with memory system |
| **1.0** | Jan 10, 2026 | Basic Twilio integration |

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DONNA SYSTEM                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Senior's   │    │    Admin     │    │   Browser    │       │
│  │    Phone     │    │  Dashboard   │    │  Test Call   │       │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘       │
│         │ PSTN              │ HTTP              │ WebSocket     │
│         ▼                   ▼                   ▼               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Express Server                        │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │    │
│  │  │   Twilio    │  │   Pipeline  │  │  Scheduler  │      │    │
│  │  │  Webhooks   │  │   Router    │  │   (60s)     │      │    │
│  │  └─────────────┘  └──────┬──────┘  └─────────────┘      │    │
│  └──────────────────────────┼──────────────────────────────┘    │
│                             │                                    │
│            ┌────────────────┴────────────────┐                  │
│            ▼                                 ▼                  │
│  ┌──────────────────────┐     ┌──────────────────────────────┐ │
│  │    V0 PIPELINE       │     │       V1 PIPELINE            │ │
│  │  (Gemini Native)     │     │  (Claude + Observer)         │ │
│  │                      │     │                              │ │
│  │  Audio → Gemini →    │     │  Audio → Deepgram → Claude   │ │
│  │         Audio        │     │         → ElevenLabs → Audio │ │
│  │                      │     │                              │ │
│  │  Latency: ~400ms     │     │  Latency: ~1.5s (target 600) │ │
│  └──────────────────────┘     └──────────────────────────────┘ │
│                                        │                        │
│                              ┌─────────┴─────────┐              │
│                              │  Observer Agent   │              │
│                              │  (every 30s)      │              │
│                              │  Analyzes mood,   │              │
│                              │  engagement,      │              │
│                              │  concerns         │              │
│                              └───────────────────┘              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    PostgreSQL (Neon)                     │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │    │
│  │  │ seniors │  │memories │  │ conver- │  │reminders│    │    │
│  │  │         │  │(pgvector│  │ sations │  │         │    │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
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

### Cost Structure (Estimated per call)
| Component | Cost | Notes |
|-----------|------|-------|
| Twilio | ~$0.02/min | Voice + Media Streams |
| Gemini (V0) | ~$0.001 | Free tier generous |
| Claude (V1) | ~$0.01 | Per response |
| Deepgram (V1) | ~$0.005/min | STT |
| ElevenLabs (V1) | ~$0.02 | Per response |
| OpenAI (embeddings) | ~$0.001 | Per memory |
| **Total V0** | ~$0.03/min | |
| **Total V1** | ~$0.06/min | |

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
| V0 Pipeline | `gemini-live.js` |
| V1 Pipeline | `pipelines/v1-advanced.js` |
| Observer | `pipelines/observer-agent.js` |
| ElevenLabs TTS | `adapters/elevenlabs.js` |
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
