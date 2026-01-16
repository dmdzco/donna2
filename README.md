# Donna - Senior Companion Assistant

**Status:** ✅ All Phases Complete | 🧪 170/170 Tests Passing | 🚀 Production Ready

An AI-powered companion that provides elderly individuals with friendly phone conversations, helpful reminders, and personalized updates. Built with a modern serverless architecture and comprehensive modular design.

## Features

### 📞 Voice Communication (Phase 1)
- **AI Phone Calls**: Natural conversations via Twilio with landline or mobile
- **Real-time Speech Processing**: Deepgram (STT) + ElevenLabs (TTS)
- **Conversation Management**: Full conversation history and turn tracking
- **Call Orchestration**: Lifecycle management with webhooks

### 💊 Reminders & Scheduling (Phase 2)
- **Medication Reminders**: Natural reminders woven into conversation
- **Appointment Tracking**: Schedule and deliver reminders
- **Automated Scheduling**: BullMQ job queue with retry logic
- **Audio Storage**: Call recordings in Vercel Blob

### 🧠 AI Intelligence (Phase 3)
- **Observer Agent**: Real-time conversation quality analysis
- **Long-term Memory**: Remembers preferences, concerns, and past conversations
- **Analytics Engine**: Usage metrics, engagement tracking, sentiment analysis
- **Personalized Context**: Dynamic conversation context building

### 🌐 Caregiver Portal
- **Web Dashboard**: Manage senior profiles and reminders
- **Conversation History**: View transcripts and insights
- **Analytics Dashboard**: Track call frequency and engagement

## Architecture

See [docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md) for detailed system design.

**Modular Design:** 11 business modules + 5 external adapters with dependency injection

```
┌─────────────────────────────────────────────────────────────┐
│                 Caregiver Portal (Next.js)                  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/REST
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  API Server (Express.js)                     │
│            Routes → DI Container → Modules                   │
└────────────────────────┬────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
  ┌──────────────────┐      ┌──────────────────┐
  │ Business Modules │      │ External Adapters│
  ├──────────────────┤      ├──────────────────┤
  │ • Senior Profiles│      │ • Anthropic AI   │
  │ • LLM Conversation│     │ • Deepgram (STT) │
  │ • Skills System  │      │ • ElevenLabs(TTS)│
  │ • Voice Pipeline │      │ • Twilio (Calls) │
  │ • Call Orchestrator│    │ • Vercel Blob    │
  │ • Conversation Mgr│     └──────────────────┘
  │ • Reminder Mgmt  │
  │ • Scheduler      │
  │ • Observer Agent │
  │ • Memory/Context │
  │ • Analytics      │
  └──────────────────┘
            │
            ▼
  ┌──────────────────────────────────┐
  │  Serverless Infrastructure       │
  │  • Neon (PostgreSQL)             │
  │  • Drizzle ORM (Type-safe)       │
  │  • Upstash Redis (Job Queue)     │
  │  • Vercel Blob (Storage)         │
  │  • Clerk (Authentication)        │
  └──────────────────────────────────┘
```

## Tech Stack

### Frontend
- **Framework**: Next.js 14, TypeScript, Tailwind CSS
- **State**: React Query
- **Auth**: Clerk

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js, TypeScript
- **Architecture**: Modular DI pattern (16 modules)
- **Testing**: Vitest (162 tests, 100% passing)

### Database & Storage
- **Database**: Neon (Serverless PostgreSQL)
- **ORM**: Drizzle (Type-safe, zero runtime overhead)
- **Storage**: Vercel Blob (Audio recordings)
- **Queue**: Upstash Redis + BullMQ

### Voice & AI
- **Calls**: Twilio
- **STT**: Deepgram
- **TTS**: ElevenLabs
- **AI**: Anthropic Claude Sonnet 3.5

## Getting Started

### Prerequisites

**API Keys & Services:**
- [Neon](https://neon.tech) account (Serverless PostgreSQL)
- [Clerk](https://clerk.com) account (Authentication)
- [Upstash](https://upstash.com) account (Redis)
- [Vercel](https://vercel.com) account (Blob storage + deployment)
- [Twilio](https://twilio.com) account (Phone calls)
- [Deepgram](https://deepgram.com) API key (STT)
- [ElevenLabs](https://elevenlabs.io) API key (TTS)
- [Anthropic](https://anthropic.com) API key (Claude AI)

**Local Development:**
- Node.js 20+
- npm or yarn

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/your-org/donna.git
cd donna
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set up environment variables:**
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```bash
# Database (Neon)
DATABASE_URL=postgresql://user:pass@host.neon.tech/donna?sslmode=require

# Authentication (Clerk)
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# Voice Services
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=rachel
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Storage & Queue
BLOB_READ_WRITE_TOKEN=vercel_blob_...
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...

# Application
API_URL=http://localhost:3001
WEB_URL=http://localhost:3000
```

4. **Run database migrations:**
```bash
npm run db:migrate
```

5. **Start development servers:**
```bash
npm run dev
```

The API server will run on `http://localhost:3001`

### Testing

**Run all tests (162 tests):**
```bash
npm test
```

**Run tests in watch mode:**
```bash
npm test -- --watch
```

**Run tests with coverage:**
```bash
npm test -- --coverage
```

**Test UIs (Manual Testing):**
- Phase 1: http://localhost:3001/test/test-phase1.html
- Phase 2: http://localhost:3001/test/test-phase2.html
- Phase 3: http://localhost:3001/test/test-phase3.html

## Project Structure

```
donna/
├── apps/
│   ├── web/                       # Next.js caregiver portal
│   └── api/                       # Express backend
│       ├── src/
│       │   ├── routes/            # API endpoints
│       │   │   ├── auth.ts
│       │   │   ├── seniors.ts
│       │   │   ├── reminders.ts
│       │   │   ├── conversations.ts
│       │   │   ├── voice.ts
│       │   │   ├── test-phase1.ts
│       │   │   ├── test-phase2.ts
│       │   │   └── test-phase3.ts
│       │   ├── middleware/        # Express middleware
│       │   └── index.ts           # Server entry
│       └── public/                # Test UI HTML files
│           ├── test-phase1.html
│           ├── test-phase2.html
│           └── test-phase3.html
├── modules/                       # Business logic modules
│   ├── senior-profiles/           # Senior CRUD
│   ├── llm-conversation/          # Claude conversation engine
│   ├── skills-system/             # Pluggable skills
│   ├── voice-pipeline/            # STT/TTS orchestration
│   ├── conversation-manager/      # Conversation storage
│   ├── call-orchestrator/         # Call lifecycle
│   ├── reminder-management/       # Reminder CRUD
│   ├── scheduler-service/         # BullMQ scheduling
│   ├── observer-agent/            # Conversation analysis
│   ├── memory-context/            # Long-term memory
│   └── analytics-engine/          # Metrics & insights
├── adapters/                      # External service wrappers
│   ├── anthropic/                 # Claude AI
│   ├── deepgram/                  # Speech-to-Text
│   ├── elevenlabs/                # Text-to-Speech
│   ├── twilio/                    # Phone calls
│   └── vercel-blob/               # File storage
├── packages/
│   └── shared/                    # Shared interfaces & types
│       └── src/interfaces/
│           └── module-interfaces.ts
├── config/
│   └── dependency-injection.ts    # DI container setup
├── database/
│   ├── schema.ts                  # Drizzle schema
│   ├── migrations/                # SQL migrations
│   └── db.ts                      # Database client
├── docs/
│   ├── architecture/              # Architecture docs
│   │   └── OVERVIEW.md
│   ├── guides/                    # How-to guides
│   │   └── DEPLOYMENT_PLAN.md
│   └── status/                    # Project status
│       ├── PHASE1_COMPLETE.md
│       ├── CHANGELOG.md
│       └── REMAINING_WORK.md
└── .env.example                   # Environment template
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create caregiver account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Seniors
- `GET /api/seniors` - List seniors
- `POST /api/seniors` - Add senior
- `GET /api/seniors/:id` - Get senior
- `PUT /api/seniors/:id` - Update senior
- `DELETE /api/seniors/:id` - Delete senior

### Reminders
- `GET /api/reminders/senior/:seniorId` - List reminders
- `POST /api/reminders` - Create reminder
- `DELETE /api/reminders/:id` - Delete reminder

### Conversations
- `GET /api/conversations/senior/:seniorId` - List conversations
- `GET /api/conversations/:id` - Get conversation with transcript

### Voice
- `POST /api/voice/call/:seniorId` - Initiate call
- `POST /api/voice/connect` - Twilio webhook (call answered)
- `POST /api/voice/status` - Twilio webhook (call status)

### Test Routes
- `GET /api/test/phase1/*` - Phase 1 module testing
- `GET /api/test/phase2/*` - Phase 2 module testing
- `GET /api/test/phase3/*` - Phase 3 module testing

## Modular Architecture

### Design Principles

**Interface-First Design:**
All modules depend on interfaces, not concrete implementations. This enables:
- Easy unit testing with mocks
- Swappable implementations
- Clear contracts between modules

**Dependency Injection:**
All modules are registered in `DonnaContainer` and dependencies are injected via constructors:

```typescript
const container = DonnaContainer.getInstance();
const callOrchestrator = container.get<ICallOrchestrator>('CallOrchestrator');
```

**Repository Pattern:**
Separation of data access (Repository) from business logic (Service):

```typescript
// Repository: Database operations with Drizzle ORM
class ConversationRepository {
  constructor(private db: DrizzleDB) {}
  async create(data: ConversationData): Promise<Conversation> { ... }
}

// Service: Business logic
class ConversationManagerService {
  constructor(private repository: IConversationRepository) {}
  async create(data: ConversationData): Promise<Conversation> { ... }
}
```

### Module Categories

**Business Modules (11 modules):**
1. Senior Profiles - CRUD for senior profiles
2. LLM Conversation - Claude conversation engine
3. Skills System - Pluggable skills (news, companionship)
4. Voice Pipeline - STT/TTS orchestration
5. Conversation Manager - Conversation storage
6. Call Orchestrator - Call lifecycle management
7. Reminder Management - Reminder CRUD
8. Scheduler Service - BullMQ job scheduling
9. Observer Agent - Conversation quality analysis
10. Memory & Context - Long-term memory
11. Analytics Engine - Usage metrics

**External Adapters (6 adapters):**
1. Anthropic - Claude AI integration
2. Deepgram - Speech-to-Text
3. ElevenLabs - Text-to-Speech
4. Twilio - Phone call gateway
5. Vercel Blob - Audio file storage
6. OpenAI - Embeddings for semantic memory search

## Deployment

See [docs/guides/DEPLOYMENT_PLAN.md](docs/guides/DEPLOYMENT_PLAN.md) for comprehensive deployment instructions.

### Quick Deploy to Vercel

1. **Install Vercel CLI:**
```bash
npm install -g vercel
```

2. **Login and deploy:**
```bash
vercel login
vercel
```

3. **Add environment variables:**
```bash
vercel env add DATABASE_URL
vercel env add ANTHROPIC_API_KEY
# ... add all required env vars
```

4. **Deploy to production:**
```bash
vercel --prod
```

### Environment Variables

All required environment variables are documented in `.env.example`. Key variables include:

- `DATABASE_URL` - Neon PostgreSQL connection
- `CLERK_SECRET_KEY` - Clerk authentication
- `ANTHROPIC_API_KEY` - Claude AI
- `DEEPGRAM_API_KEY` - Speech-to-Text
- `ELEVENLABS_API_KEY` - Text-to-Speech
- `TWILIO_ACCOUNT_SID` - Phone calls
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob storage
- `UPSTASH_REDIS_REST_URL` - Redis job queue

## Documentation

- **Architecture Overview**: [docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md)
- **Deployment Guide**: [docs/guides/DEPLOYMENT_PLAN.md](docs/guides/DEPLOYMENT_PLAN.md)
- **Phase 1 Complete**: [docs/status/PHASE1_COMPLETE.md](docs/status/PHASE1_COMPLETE.md)
- **Remaining Work**: [docs/status/REMAINING_WORK.md](docs/status/REMAINING_WORK.md)
- **Changelog**: [docs/status/CHANGELOG.md](docs/status/CHANGELOG.md)

## Contributing

This is a private project. For questions or contributions, please contact the project maintainers.

## License

Private - All rights reserved
