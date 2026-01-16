# Donna - Next Steps Roadmap

> **Focus for Next Session**: Work through these steps sequentially. Each step is testable independently before moving on.

## Current State (v2.1)

**Working:**
- Real-time voice calls (Gemini 2.5 native audio + Twilio Media Streams)
- Senior profiles + PostgreSQL database
- Memory system (storage, semantic search, extraction at call end)
- Reminder storage (in DB, but not triggered automatically)
- Conversation history with transcripts
- Admin UI at `/admin`
- ✅ **User speech transcription (Deepgram STT)**
- ✅ **Mid-conversation memory retrieval** (triggers on keywords like "daughter", "doctor", etc.)

**Next Priority:** Step 2 - Scheduled Calls

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

### Step 2: Scheduled Call System
**Goal:** Reminders actually trigger automated calls

**Why second:** Reminders exist in DB. This connects them to outbound calls. Now with working transcription, calls will be higher quality.

**Tasks:**
1. Add a simple scheduler (node-cron or setInterval polling)
2. Query for reminders due in the next minute
3. Trigger outbound call when reminder fires
4. Inject reminder context into Gemini prompt
   - Example: "Remember to gently remind them to take their blood pressure medication"
5. Mark reminder as delivered after call

**Files to modify:**
- `index.js` - Add scheduler startup
- Create `services/scheduler.js` - Scheduling logic
- `gemini-live.js` - Accept reminder context in system prompt

**Test:** Create a reminder for 2 minutes from now, verify Donna calls and mentions it.

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

### Step 5: News/Weather Updates
**Goal:** Richer conversations with current information

**Why fifth:** Adds value once core system is stable.

**Tasks:**
1. Integrate news API (options: NewsAPI, Google News, or OpenAI web search)
2. Fetch headlines based on:
   - Senior's location (for local news/weather)
   - Senior's interests (sports, politics, etc.)
3. Inject as system prompt context before call
4. Let Donna mention naturally: "I saw some interesting news today..."

**Implementation options:**
- A: Pre-fetch news daily, store in DB
- B: Fetch fresh at call start
- C: Use OpenAI's web search tool for real-time info

**Test:** Call a senior, Donna shares relevant news when conversation allows.

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
│  Step 2: Scheduled Calls ← CURRENT PRIORITY            │
│  └── "Reminders trigger automated calls"               │
│              ↓                                          │
│  Step 3: Admin Dashboard                               │
│  └── "Full visibility and management"                  │
│              ↓                                          │
│  Step 4: Caregiver Login                               │
│  └── "Secure multi-user access"                        │
│              ↓                                          │
│  Step 5: News Updates                                  │
│  └── "Richer conversations with current info"          │
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

*Last updated: January 16, 2026 - Step 1 (Deepgram STT) complete*
