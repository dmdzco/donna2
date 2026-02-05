# Donna Project - AI Context

> **AI Assistants**: You have permission to update this file as the project evolves. Keep it accurate and current.

---

## Project Goal

**Donna** is an AI-powered companion that makes friendly phone calls to elderly individuals, providing:
- **Daily check-ins** - Warm, conversational calls to combat loneliness
- **Medication reminders** - Gentle, natural reminders woven into conversation
- **Companionship** - Discussing interests, sharing news, being a friendly presence
- **Caregiver peace of mind** - Summaries and alerts for family members

**Target Users**:
- **Seniors** (70+) who live alone or have limited social contact
- **Caregivers** (adult children, family) who want to ensure their loved ones are okay

---

## Current Status: v3.3

### Working Features
- **Conversation Director Architecture (2-Layer + Post-Call)**
  - Layer 1: Quick Observer (0ms) - Instant regex patterns + goodbye detection + factual/curiosity patterns
  - Layer 2: Conversation Director (~150ms) - Proactive call guidance (Gemini 3 Flash)
  - Post-Call Analysis - Async batch analysis when call ends
- **Dynamic Token Routing** - Automatic token adjustment (100-400 tokens)
- **Streaming Pipeline** (~600ms time-to-first-audio)
  - Claude streaming responses (sentence-by-sentence)
  - ElevenLabs WebSocket TTS
  - Parallel connection startup
- **In-Call Memory Tracking** - Topics, questions, advice, stories tracked per call to prevent repetition
- **Same-Day Cross-Call Memory** - Daily context persists across multiple calls per senior per day
- **Enhanced Web Search** - 18 factual/curiosity patterns + improved search triggers and senior-friendly prompts
- **Greeting Rotation** - 24 time-based templates with context-aware followups
- **In-Call Reminder Tracking** - Delivery tracking with acknowledgment detection
- **Graceful Call Ending** - Goodbye signal detection + Twilio-based termination
- **Route Extraction** - 16 modular route files + websocket handler
- **Admin Dashboard Auth** - JWT-based login with admin_users table (bcrypt passwords)
- **Admin Dashboard** - Static HTML with 7 tabs: Dashboard, Seniors, Calls, Reminders, Call Analyses, Caregivers, Daily Context
- Real-time voice calls (Twilio Media Streams)
- Speech transcription (Deepgram STT)
- Memory system with semantic search (pgvector)
- News updates via OpenAI web search
- Scheduled reminder calls
- Consumer app (caregiver onboarding + dashboard)
- Observability dashboard (React)
- Security: Clerk auth, JWT admin auth (enforced in prod), Zod validation, rate limiting (incl. admin login brute-force), Twilio webhook verification, Helmet headers (HSTS 1yr), API key auth, PII-safe logging

---

## Architecture

**Full documentation**: [docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md)

### Conversation Director Architecture

```
User speaks → Deepgram STT → Process utterance
                                  │
                  ┌───────────────┼───────────────┐
                  ▼               ▼
            Layer 1 (0ms)   Layer 2 (~150ms)
            Quick Observer  Conversation Director
            (regex)         (Gemini 3 Flash)
                  │               │
                  └───────┬───────┘
                          ▼
              ┌─────────────────────┐
              │ Dynamic Token Select│
              │   (100-400 tokens)  │
              └──────────┬──────────┘
                         ▼
              Claude Sonnet Streaming
                         │
                         ▼
              Sentence Buffer → ElevenLabs WS → Twilio
                         │
                         ▼ (on call end)
              Post-Call Analysis (Gemini Flash)
              - Summary, concerns, engagement score
```

### Conversation Director

The Director proactively guides each call:

| Feature | Description |
|---------|-------------|
| **Call Phase Tracking** | opening → rapport → main → closing |
| **Topic Management** | When to stay, transition, or wrap up |
| **Reminder Delivery** | Natural moments to deliver reminders |
| **Engagement Monitoring** | Detect low engagement, suggest re-engagement |
| **Emotional Detection** | Adjust tone for sad/concerned seniors |
| **Token Recommendations** | 100-400 tokens based on context |

### Dynamic Token Selection

| Situation | Tokens | Trigger |
|-----------|--------|---------|
| Normal conversation | 100 | Default |
| Health mention | 150 | Quick Observer |
| Emotional support | 200-250 | Director |
| Low engagement | 200 | Director |
| Reminder delivery | 150 | Director |
| Call closing | 150 | Director |

### Key Files

```
/
├── index.js                    ← Server setup + middleware mounting (~90 lines)
├── routes/
│   ├── index.js                ← Route aggregator (mountRoutes)
│   ├── helpers.js              ← Shared auth helpers
│   ├── health.js               ← Health check
│   ├── voice.js                ← Twilio voice webhooks
│   ├── calls.js                ← Call initiation
│   ├── seniors.js              ← Senior CRUD
│   ├── memories.js             ← Memory management
│   ├── conversations.js        ← Conversation history
│   ├── reminders.js            ← Reminder CRUD
│   ├── onboarding.js           ← Consumer app onboarding
│   ├── caregivers.js           ← Caregiver management + admin list
│   ├── stats.js                ← Dashboard statistics
│   ├── observability.js        ← Observability data
│   ├── admin-auth.js           ← Admin login + JWT auth
│   ├── call-analyses.js        ← Post-call analysis data
│   └── daily-context.js        ← Cross-call daily context data
├── websocket/
│   └── media-stream.js         ← Twilio + Browser WebSocket handlers
├── pipelines/
│   ├── v1-advanced.js          ← Main voice pipeline + call state
│   ├── quick-observer.js       ← Layer 1: Instant regex patterns + goodbye detection
│   └── fast-observer.js        ← Layer 2: Conversation Director
├── adapters/
│   ├── llm/index.js            ← Multi-provider LLM adapter (model registry)
│   ├── elevenlabs.js           ← ElevenLabs REST TTS adapter
│   └── elevenlabs-streaming.js ← ElevenLabs WebSocket TTS
├── services/
│   ├── greetings.js            ← Greeting rotation (24 templates)
│   ├── daily-context.js        ← Same-day cross-call memory service
│   ├── call-analysis.js        ← Post-call batch analysis
│   ├── caregivers.js           ← Caregiver-senior relationships
│   ├── context-cache.js        ← Pre-caches senior context (5 AM local)
│   ├── memory.js               ← Memory storage + semantic search
│   ├── seniors.js              ← Senior profile CRUD
│   ├── conversations.js        ← Conversation history
│   ├── scheduler.js            ← Reminder scheduler
│   └── news.js                 ← News via OpenAI web search
├── middleware/
│   ├── auth.js                 ← Clerk + JWT + cofounder auth (JWT_SECRET enforced in prod)
│   ├── security.js             ← Helmet headers + request ID + HSTS 1yr
│   ├── rate-limit.js           ← Rate limiting (API, call, write, auth, webhook)
│   ├── api-auth.js             ← API key authentication (DONNA_API_KEY)
│   ├── twilio.js               ← Twilio webhook signature validation
│   ├── validate.js             ← Zod validation middleware
│   └── error-handler.js        ← Centralized error handler
├── lib/
│   ├── logger.js               ← PII-safe structured logger
│   └── sanitize.js             ← Phone/name/content masking
├── validators/
│   └── schemas.js              ← Zod schemas for all API inputs
├── db/
│   ├── client.js               ← Database connection (Neon + Drizzle)
│   ├── schema.js               ← Database schema (9 tables, Drizzle ORM)
│   └── setup-pgvector.js       ← pgvector initialization
├── scripts/
│   └── create-admin.js         ← Seed script for admin users
├── packages/
│   ├── logger/                 ← TypeScript logging package
│   └── event-bus/              ← TypeScript event bus package
├── apps/
│   ├── admin/                  ← Admin dashboard (React + Vite)
│   ├── consumer/               ← Consumer app (React + Vite + Clerk, Vercel)
│   ├── observability/          ← Observability dashboard (React)
│   └── web/                    ← Future web app placeholder
└── audio-utils.js              ← Audio format conversion
```

---

## For AI Assistants

### When Making Changes

| Task | Where to Look |
|------|---------------|
| Change conversation behavior | `pipelines/v1-advanced.js` |
| Modify streaming TTS | `adapters/elevenlabs-streaming.js` |
| Add instant analysis patterns | `pipelines/quick-observer.js` |
| Modify Conversation Director | `pipelines/fast-observer.js` |
| Modify post-call analysis | `services/call-analysis.js` |
| Change token selection logic | `pipelines/v1-advanced.js` (selectModelConfig) |
| Modify system prompts | `pipelines/v1-advanced.js` (buildSystemPrompt) |
| Pre-cache senior context | `services/context-cache.js` |
| Add new LLM model | `adapters/llm/index.js` (MODEL_REGISTRY) |
| Add new API endpoint | `routes/` (create new route file, register in `routes/index.js`) |
| Modify greeting templates | `services/greetings.js` |
| Change reminder tracking | `pipelines/v1-advanced.js` (deliveredReminderSet) |
| Modify in-call memory tracking | `pipelines/v1-advanced.js` (extractConversationElements, trackTopicsFromSignals) |
| Modify cross-call daily context | `services/daily-context.js` |
| Modify goodbye/call ending | `pipelines/v1-advanced.js` + `pipelines/quick-observer.js` |
| Update admin UI | `public/admin.html` (static HTML) |
| Update admin API client | `public/admin.html` (authFetch in script) |
| Admin authentication | `routes/admin-auth.js` + `middleware/auth.js` |
| Call analyses data | `routes/call-analyses.js` |
| Daily context data | `routes/daily-context.js` |
| Create admin user | `node scripts/create-admin.js email password name` |
| Database changes | `db/schema.js` |

### Documentation Updates

**IMPORTANT**: After each commit that adds features, changes architecture, or modifies the project structure, update the following documentation files to reflect the changes:

1. **`README.md`** - Update features, project structure, API endpoints, Quick Start
2. **`docs/architecture/OVERVIEW.md`** - Update architecture diagrams, key files, DB schema
3. **`docs/ARCHITECTURE.md`** - Update architecture diagrams, key files
4. **`docs/PRODUCT_PLAN.md`** - Mark features as implemented, update version, add new entries
5. **`CLAUDE.md`** (this file) - Update working features, key files, roadmap status

Keep all docs in sync. If a new file/directory is created, add it to the Key Files sections. If a feature is completed, mark it done in the roadmap and PRODUCT_PLAN.

### Deployment

**IMPORTANT**: Always deploy after committing and pushing changes:

```bash
git add . && git commit -m "your message" && git push && git push origin main:master && railway up
```

Or use the alias after committing:
```bash
git pushall && railway up
```

Railway's GitHub webhook is unreliable - always run `railway up` manually to deploy.

### Environment Variables

```bash
# Required
PORT=3001
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
DATABASE_URL=...
OPENAI_API_KEY=...          # Embeddings + news
ANTHROPIC_API_KEY=...       # Claude Sonnet (voice)
GOOGLE_API_KEY=...          # Gemini Flash (Director + Analysis)
ELEVENLABS_API_KEY=...      # TTS
DEEPGRAM_API_KEY=...        # STT

# Optional
V1_STREAMING_ENABLED=true   # Set to 'false' to disable streaming
VOICE_MODEL=claude-sonnet   # Main voice model
FAST_OBSERVER_MODEL=gemini-3-flash  # Director model
JWT_SECRET=...              # Admin dashboard JWT signing key
DONNA_API_KEY=...           # Set to enable API key auth (omit for dev)
```

---

## Roadmap

See [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) for upcoming work:
- ~~Streaming Pipeline~~ ✓ Completed (~600ms latency)
- ~~Dynamic Token Routing~~ ✓ Completed
- ~~Conversation Director~~ ✓ Completed
- ~~Post-Call Analysis~~ ✓ Completed
- ~~Admin Dashboard Separation~~ ✓ Completed (React app in `apps/admin/`)
- ~~Security Hardening~~ ✓ Completed (Helmet, API key auth, PII-safe logging, input validation)
- Prompt Caching (Anthropic)

### Architecture Cleanup

See [docs/ARCHITECTURE_CLEANUP_PLAN.md](docs/ARCHITECTURE_CLEANUP_PLAN.md) for the 7-phase restructuring plan:
- **Phase 1** ✓ Frontend Separation (Admin Dashboard → React)
- **Phase 2** ✓ Route Extraction (Split index.js → 13 route modules)
- **Phase 3** Shared Packages (Turborepo monorepo)
- **Phase 4** TypeScript Migration
- **Phase 5** Testing Infrastructure
- **Phase 6** API Improvements (Zod, versioning)
- **Phase 7** Authentication (Clerk)
- Memory Context Improvements
- Caregiver Authentication (Clerk)
- Telnyx Migration (65% cost savings)

---

*Last updated: February 2026 - v3.3*
