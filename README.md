# Donna - AI Senior Companion

AI-powered companion that provides elderly individuals with friendly phone conversations, helpful reminders, and personalized updates.

## Quick Start

```bash
npm install
npm run dev
```

Test it works:
```bash
curl http://localhost:3001/health
```

Deploy to Railway, configure Twilio webhook, and call your number.

## Build Approach

Donna is built incrementally, starting simple and adding complexity:

| Phase | Milestones | What You Get |
|-------|------------|--------------|
| **A** | 1-6 | Twilio + Gemini native voice (simple, works today) |
| **B** | 7-10 | Add database, reminders, scheduling |
| **C** | 11-15 | Full architecture with Claude, memory, analytics |

**Start here:** [docs/INCREMENTAL_BUILD_GUIDE.md](docs/INCREMENTAL_BUILD_GUIDE.md)

### Current: Milestone 1 - Hello World

Twilio answers calls and plays a greeting. No AI yet, just proving the pipeline works.

```
Phone Call → Twilio → Your Server → TwiML Response → "Hello!"
```

### Next Steps

1. **Milestone 2**: Add Gemini for real AI conversations
2. **Milestone 3**: WebSocket streaming for natural dialogue
3. **Milestone 4**: Outbound calls (Donna calls the senior)

## Long-Term Architecture

The full system (Phase C, Milestones 11-15) looks like this:

```
┌─────────────────────────────────────────────────────────────┐
│                 Caregiver Portal (Next.js)                  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  API Server (Express.js)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
  ┌──────────────────┐      ┌──────────────────┐
  │ Business Modules │      │ External Adapters│
  ├──────────────────┤      ├──────────────────┤
  │ • Senior Profiles│      │ • Claude AI      │
  │ • Voice Pipeline │      │ • Deepgram (STT) │
  │ • Call Manager   │      │ • ElevenLabs(TTS)│
  │ • Reminders      │      │ • Twilio (Calls) │
  │ • Scheduler      │      │ • Cloud Storage  │
  │ • Memory/Context │      └──────────────────┘
  │ • Analytics      │
  └──────────────────┘
            │
  ┌─────────▼──────────────────────────┐
  │  Infrastructure                    │
  │  • Neon (PostgreSQL)               │
  │  • Upstash Redis (Job Queue)       │
  │  • Clerk (Authentication)          │
  └────────────────────────────────────┘
```

But you don't need all this to start. Phase A uses just Twilio + Gemini.

## Tech Stack by Phase

### Phase A (Milestones 1-6) - Start Here
- **Calls**: Twilio
- **AI**: Google Gemini 2.5 Flash (native voice)
- **Deploy**: Railway

### Phase B (Milestones 7-10) - Add Persistence
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle
- **Queue**: Upstash Redis

### Phase C (Milestones 11-15) - Full Stack
- **AI**: Claude + Deepgram + ElevenLabs
- **Memory**: pgvector for semantic search
- **Auth**: Clerk
- **Analytics**: Custom dashboard

## Environment Variables

Start with just these (Milestone 1):
```bash
PORT=3001
```

Add as you progress:
```bash
# Milestone 2+
GOOGLE_API_KEY=your_gemini_key

# Milestone 4+
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# Milestone 7+
DATABASE_URL=postgresql://...

# Milestone 11+
ANTHROPIC_API_KEY=...
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...
```

See [.env.example](.env.example) for all variables.

## Deployment

**Railway** (recommended):
1. Push to GitHub
2. Connect repo on [railway.app](https://railway.app)
3. Add environment variables
4. Deploy

See [docs/guides/DEPLOYMENT_PLAN.md](docs/guides/DEPLOYMENT_PLAN.md)

## Documentation

| Doc | Purpose |
|-----|---------|
| [INCREMENTAL_BUILD_GUIDE.md](docs/INCREMENTAL_BUILD_GUIDE.md) | Step-by-step milestone guide |
| [DEPLOYMENT_PLAN.md](docs/guides/DEPLOYMENT_PLAN.md) | Railway deployment |
| [architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md) | Full system design (Phase C) |
| [architecture/MODULES.md](docs/architecture/MODULES.md) | Module reference (Phase C) |

## Project Structure

```
donna/
├── index.js              # Current code (Milestone 1)
├── package.json
├── railway.json
├── .env.example
├── docs/
│   ├── INCREMENTAL_BUILD_GUIDE.md   # Main roadmap
│   ├── guides/
│   └── architecture/
└── reference/            # DO NOT USE YET - Phase C reference only
    ├── README.md         # Explains when to use this code
    ├── modules/          # Business logic (Milestones 7-14)
    ├── adapters/         # External services (Milestone 11+)
    ├── apps/             # Full Express API
    ├── database/         # Drizzle schemas
    └── config/           # DI container
```

The `reference/` folder contains a complete implementation of the full architecture. **Do not use it for Milestones 1-6.** It's there to guide implementation when you reach Phase B and C.

## License

Private - All rights reserved
