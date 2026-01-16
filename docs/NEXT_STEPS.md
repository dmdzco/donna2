# Donna - Next Steps Roadmap

> **Focus for Next Session**: Work through these steps sequentially. Each step is testable independently before moving on.

## Current State (v2.3)

**Working:**
- Real-time voice calls (Gemini 2.5 native audio + Twilio Media Streams)
- Senior profiles + PostgreSQL database
- Memory system (storage, semantic search, extraction at call end)
- Conversation history with transcripts
- Admin UI at `/admin`
- ✅ **User speech transcription (Deepgram STT)**
- ✅ **Mid-conversation memory retrieval** (triggers on keywords)
- ✅ **News updates via OpenAI web search** (based on interests, cached 1hr)
- ✅ **Scheduled reminder calls** (auto-triggers when reminders due)

**Next Priority:** Admin Dashboard

---

## Step-by-Step Implementation Plan

### Step 1: User Speech Transcription (Deepgram) ✅ COMPLETE
**Goal:** Enable mid-conversation memory retrieval

**Status:** ✅ Implemented and verified working (January 2026)

**What was built:**
- Deepgram SDK integration for real-time STT
- Audio forked: Gemini (voice AI) + Deepgram (transcription)
- Memory trigger detection on keywords ("daughter", "doctor", "medication", etc.)
- Mid-call memory injection into conversation

**Architecture:**
```
Twilio Audio → ┬→ Gemini (voice AI + response)
               └→ Deepgram (user speech → text)
                     ↓
               Memory triggers → inject context
```

**Verified:** Mid-call memory retrieval working - mentioning family members triggers relevant memories.

---

### Step 2: Scheduled Call System ✅ COMPLETE
**Goal:** Reminders actually trigger automated calls

**Status:** ✅ Implemented January 2026

**What was built:**
- `services/scheduler.js` - Scheduler service with 60-second polling
- Queries for due reminders (one-time and recurring)
- Triggers outbound calls via Twilio
- Injects reminder context into system prompt
- Marks reminders as delivered after call initiated

**Architecture:**
```
Server Boot → Scheduler Starts (60s interval)
    ↓
Check Due Reminders → Trigger Outbound Call
    ↓
/voice/answer → Get Reminder Context → Inject into System Prompt
    ↓
Donna delivers reminder naturally in conversation
```

**Verified:** Scheduler running in production, checks every 60 seconds.

---

### Step 3: Admin Dashboard Enhancement
**Goal:** Full visibility into seniors, reminders, and conversations

**Why third:** Need visibility before adding caregiver accounts.

**Tasks:**
1. Expand existing `/admin` page or create separate Next.js app
2. Features needed:
   - List all seniors with search/filter
   - View/edit senior profiles
   - View memories for each senior
   - Create/edit/delete reminders
   - View recent call transcripts
   - Trigger test calls from UI
   - View scheduled calls

**Options:**
- A: Enhance `public/admin.html` with more features
- B: Create `web/` Next.js app for full dashboard

**Test:** Manage a senior entirely through the web UI (create, add reminder, trigger call, view transcript).

---

### Step 4: Caregiver Authentication
**Goal:** Secure multi-user access with login

**Why fourth:** Secure the dashboard before exposing externally.

**Tasks:**
1. Choose auth provider (Clerk recommended, or simple JWT)
2. Create caregiver table in database
3. Link caregivers to seniors (many-to-many relationship)
4. Protect API routes with authentication middleware
5. Filter data to only show assigned seniors

**Database additions:**
```sql
caregivers (id, email, name, created_at)
caregiver_seniors (caregiver_id, senior_id)  -- junction table
```

**Test:** Log in as caregiver, only see your assigned seniors.

---

### Step 5: News/Weather Updates ✅ COMPLETE
**Goal:** Richer conversations with current information

**Status:** ✅ Implemented January 2026

**What was built:**
- `services/news.js` - News service using OpenAI Responses API with web_search tool
- Fetches 2-3 positive, senior-appropriate headlines based on interests
- 1-hour cache to reduce API calls
- Integrated into memory context builder
- System prompt updated with guidance for natural news conversation

**Architecture:**
```
Call Start → Senior Profile (interests) → OpenAI Web Search → News Context → System Prompt
```

**Verified:** News context added to conversations for seniors with interests configured.

---

### Step 6: Voice Quality Upgrade (ElevenLabs)
**Goal:** Production-grade voice synthesis

**Why last:** Voice provider swapping is a bigger lift, nice-to-have.

**Options:**

**Option A: Keep Gemini Native Audio**
- Pros: Simpler, lower latency, already working
- Cons: Less control over voice quality

**Option B: Gemini for conversation + ElevenLabs for TTS**
- Use `providers/` abstraction layer
- Gemini handles conversation logic, outputs text
- Route text through ElevenLabs for speech
- Handle audio format conversion

**Option C: Full provider swap (Claude + Deepgram + ElevenLabs)**
- Most complex, highest quality
- Use prepared `providers/session-manager.js`

**Test:** Compare call quality before/after voice upgrade.

---

## Visual Roadmap

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Step 1: Deepgram STT ✅ DONE                          │
│  └── "Mid-call memory retrieval unlocked"              │
│              ↓                                          │
│  Step 5: News Updates ✅ DONE                          │
│  └── "Richer conversations with current info"          │
│              ↓                                          │
│  Step 2: Scheduled Calls ✅ DONE                       │
│  └── "Reminders trigger automated calls"               │
│              ↓                                          │
│  Step 3: Admin Dashboard ← CURRENT PRIORITY            │
│  └── "Full visibility and management"                  │
│              ↓                                          │
│  Step 4: Caregiver Login                               │
│  └── "Secure multi-user access"                        │
│              ↓                                          │
│  Step 6: ElevenLabs TTS                                │
│  └── "Production voice quality"                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Reference: Files to Know

| Feature Area | Key Files |
|--------------|-----------|
| Voice calls | `gemini-live.js`, `index.js` |
| Audio conversion | `audio-utils.js` |
| Memory system | `services/memory.js` |
| News updates | `services/news.js` |
| Scheduled calls | `services/scheduler.js` |
| Senior profiles | `services/seniors.js` |
| Database schema | `db/schema.js` |
| Provider abstraction | `providers/` (prepared, not integrated) |
| Admin UI | `public/admin.html` |

---

## Environment Variables Needed

```bash
# Currently required
GOOGLE_API_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
DATABASE_URL=...
OPENAI_API_KEY=...

# Step 1: Deepgram (current priority)
DEEPGRAM_API_KEY=...

# Step 4: Auth (if using Clerk)
CLERK_SECRET_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...

# Step 5: News (pick one)
NEWS_API_KEY=...              # If using NewsAPI

# Step 6: ElevenLabs
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

---

*Last updated: January 16, 2026 - Steps 1, 2, 5 complete (Deepgram STT, Scheduled Calls, News Updates)*
