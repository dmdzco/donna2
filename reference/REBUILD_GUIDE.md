# DONNA AI - Complete Rebuild Guide

> This document contains everything needed to rebuild the Donna AI-Powered Senior Companion Assistant from scratch. It includes all architectural decisions, dependencies, integrations, and implementation details.

**Version:** 0.3.0
**Last Updated:** January 2026
**Status:** Production Ready | 170/170 Tests Passing

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [External Services & APIs](#3-external-services--apis)
4. [Project Structure](#4-project-structure)
5. [Database Schema](#5-database-schema)
6. [Module Architecture](#6-module-architecture)
7. [Adapter Layer](#7-adapter-layer)
8. [API Routes](#8-api-routes)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Dependency Injection](#10-dependency-injection)
11. [Environment Variables](#11-environment-variables)
12. [Build & Deployment](#12-build--deployment)
13. [Testing Strategy](#13-testing-strategy)
14. [Design Patterns](#14-design-patterns)
15. [Implementation Order](#15-implementation-order)

---

## 1. Project Overview

**Donna** is a comprehensive AI-powered companion system for elderly individuals, providing:
- Automated phone calls for check-ins and companionship
- Medication and appointment reminders
- Natural voice conversations powered by Claude AI
- Long-term memory and personalization
- Caregiver dashboard for monitoring

### Core Features

| Feature | Description |
|---------|-------------|
| Voice Calls | Twilio-powered outbound calls with natural conversation |
| Speech-to-Text | Real-time transcription via Deepgram |
| Text-to-Speech | Natural voice synthesis via ElevenLabs |
| AI Conversation | Claude-powered contextual conversations |
| Reminders | Medication/appointment scheduling with BullMQ |
| Memory System | Long-term memory with semantic search (pgvector) |
| Analytics | Engagement tracking and caregiver insights |

### Architecture Principles

1. **Interface-First Design** - All modules communicate through TypeScript interfaces
2. **Dependency Injection** - Single container manages all dependencies
3. **Repository Pattern** - Data access separated from business logic
4. **Adapter Pattern** - External SDKs wrapped behind standard interfaces
5. **Modular Monorepo** - Turborepo workspace with isolated packages

---

## 2. Technology Stack

### Core Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | >=20.0.0 | Runtime |
| **TypeScript** | ^5.3.0 | Language |
| **Turborepo** | ^2.0.0 | Monorepo build system |
| **npm workspaces** | 10.0.0 | Package management |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Express.js** | ^4.18.0 | API server (PORT 3001) |
| **Drizzle ORM** | ^0.31.8 | Type-safe database ORM |
| **drizzle-kit** | ^0.31.8 | Migration tool |
| **jsonwebtoken** | ^9.0.0 | JWT authentication |
| **bcryptjs** | ^2.4.3 | Password hashing |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 14 | React framework (PORT 3000) |
| **React** | 18 | UI library |
| **Tailwind CSS** | ^3.4.0 | Styling |
| **React Query** | ^5.0.0 | Data fetching |
| **Clerk** | Latest | Authentication |

### Testing

| Technology | Version | Purpose |
|------------|---------|---------|
| **Vitest** | ^1.0.0 | Test runner (Jest-compatible) |
| **vi.mock()** | - | SDK mocking |

### External SDKs

| SDK | Version | Purpose |
|-----|---------|---------|
| `@anthropic-ai/sdk` | Latest | Claude AI conversations |
| `@deepgram/sdk` | Latest | Speech-to-text |
| `elevenlabs` | Latest | Text-to-speech |
| `twilio` | Latest | Phone calls |
| `@vercel/blob` | Latest | Audio storage |
| `openai` | Latest | Embeddings for semantic search |

---

## 3. External Services & APIs

### Voice Communication

#### Twilio (Phone Calls)
- **Purpose:** Outbound phone calls, webhooks
- **Website:** twilio.com
- **Required Credentials:**
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`
- **Webhook Configuration:**
  - Answer URL: `{API_URL}/api/voice/connect`
  - Status URL: `{API_URL}/api/voice/status`
- **Cost:** ~$0.02/min

#### Deepgram (Speech-to-Text)
- **Purpose:** Real-time audio transcription
- **Website:** deepgram.com
- **Required Credentials:**
  - `DEEPGRAM_API_KEY`
- **Cost:** ~$0.009/min

#### ElevenLabs (Text-to-Speech)
- **Purpose:** Natural voice synthesis
- **Website:** elevenlabs.io
- **Required Credentials:**
  - `ELEVENLABS_API_KEY`
  - `ELEVENLABS_VOICE_ID` (default: "rachel")
- **Cost:** ~$0.30 per 1M characters

### AI Services

#### Anthropic Claude
- **Purpose:** Conversation engine, observer agent analysis
- **Website:** console.anthropic.com
- **Model:** `claude-sonnet-4-20250514`
- **Required Credentials:**
  - `ANTHROPIC_API_KEY`
- **Cost:** ~$3/1M input tokens, ~$15/1M output tokens

#### OpenAI (Embeddings Only)
- **Purpose:** Semantic search via embeddings
- **Website:** platform.openai.com
- **Model:** `text-embedding-3-small`
- **Dimensions:** 1536
- **Required Credentials:**
  - `OPENAI_API_KEY`
- **Cost:** ~$0.02 per 1M tokens

### Database & Storage

#### Neon (Serverless PostgreSQL)
- **Purpose:** Primary database
- **Website:** neon.tech
- **Required Credentials:**
  - `DATABASE_URL` (connection string)
- **Features:**
  - Serverless auto-scaling
  - pgvector extension (pre-installed)
  - Branch/clone support
- **Cost:** Free tier (200MB), then ~$0.16/GB/month

#### Upstash Redis
- **Purpose:** BullMQ job queue for scheduling
- **Website:** upstash.com
- **Required Credentials:**
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- **Cost:** Free tier (10K commands/day)

#### Vercel Blob Storage
- **Purpose:** Audio recording storage
- **Website:** vercel.com
- **Required Credentials:**
  - `BLOB_READ_WRITE_TOKEN`
- **Cost:** $0.50/GB

### Authentication

#### Clerk
- **Purpose:** Managed authentication for caregiver portal
- **Website:** clerk.com
- **Required Credentials:**
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
  - `CLERK_WEBHOOK_SECRET`
- **Cost:** Free for 10K MAU

---

## 4. Project Structure

```
donna-agent-5/
├── apps/
│   ├── api/                    # Express.js backend (PORT 3001)
│   │   ├── src/
│   │   │   ├── index.ts        # Server entry point
│   │   │   ├── routes/         # API endpoint handlers
│   │   │   │   ├── auth.ts
│   │   │   │   ├── seniors.ts
│   │   │   │   ├── reminders.ts
│   │   │   │   ├── conversations.ts
│   │   │   │   ├── voice.ts
│   │   │   │   ├── test-phase1.ts
│   │   │   │   ├── test-phase2.ts
│   │   │   │   └── test-phase3.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.js
│   │   │   │   └── error-handler.js
│   │   │   ├── services/
│   │   │   └── db/
│   │   │       ├── client.ts
│   │   │       └── seed.ts
│   │   ├── public/             # Test HTML UIs
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                    # Next.js frontend (PORT 3000)
│       ├── src/
│       │   ├── app/
│       │   │   ├── page.tsx
│       │   │   ├── layout.tsx
│       │   │   ├── login/
│       │   │   ├── signup/
│       │   │   ├── dashboard/
│       │   │   └── seniors/
│       │   └── lib/
│       ├── next.config.js
│       ├── tailwind.config.ts
│       └── package.json
│
├── modules/                    # Business logic (11 modules)
│   ├── senior-profiles/        # Senior CRUD
│   ├── llm-conversation/       # Claude conversation engine
│   ├── skills-system/          # Pluggable skills
│   ├── voice-pipeline/         # STT/TTS orchestration
│   ├── conversation-manager/   # Conversation storage
│   ├── call-orchestrator/      # Call lifecycle
│   ├── reminder-management/    # Reminder CRUD
│   ├── scheduler-service/      # BullMQ scheduling
│   ├── observer-agent/         # Conversation analysis
│   ├── memory-context/         # Long-term memory
│   └── analytics-engine/       # Usage metrics
│
├── adapters/                   # External service wrappers (6 adapters)
│   ├── anthropic/              # Claude AI
│   ├── deepgram/               # Speech-to-text
│   ├── elevenlabs/             # Text-to-speech
│   ├── twilio/                 # Phone calls
│   ├── vercel-blob/            # Audio storage
│   └── openai/                 # Embeddings
│
├── packages/
│   └── shared/                 # Shared interfaces & types
│       └── src/
│           └── interfaces/
│               └── module-interfaces.ts
│
├── config/                     # Dependency injection
│   └── src/
│       └── dependency-injection.ts
│
├── database/                   # Schema & migrations
│   ├── src/
│   │   ├── schema.ts           # Drizzle ORM schema
│   │   └── index.ts
│   ├── migrations/
│   └── package.json
│
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   └── docker-compose.yml
│
├── docs/                       # Documentation
│
├── package.json                # Root workspace config
├── turbo.json                  # Turbo build config
├── drizzle.config.ts           # Drizzle ORM config
└── .env.example
```

---

## 5. Database Schema

All tables defined in `/database/src/schema.ts` using **Drizzle ORM**.

### Core Tables

#### caregivers
```sql
CREATE TABLE caregivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### seniors
```sql
CREATE TABLE seniors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id UUID REFERENCES caregivers(id),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  date_of_birth DATE,
  timezone VARCHAR(100) DEFAULT 'America/New_York',
  location_city VARCHAR(255),
  location_state VARCHAR(100),
  interests TEXT[],
  family_info JSONB,
  medical_notes TEXT,
  preferred_call_times JSONB,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### reminders
```sql
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  senior_id UUID REFERENCES seniors(id),
  type VARCHAR(50), -- 'medication' | 'appointment' | 'custom'
  title VARCHAR(255) NOT NULL,
  description TEXT,
  schedule_cron VARCHAR(100),
  scheduled_time TIMESTAMP,
  is_recurring BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  last_delivered_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### conversations
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  senior_id UUID REFERENCES seniors(id),
  call_sid VARCHAR(100), -- Twilio Call SID
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  status VARCHAR(50), -- 'in_progress' | 'completed' | 'no_answer' | 'failed'
  initiated_by VARCHAR(50), -- 'scheduled' | 'manual' | 'senior_callback'
  audio_url TEXT,
  summary TEXT,
  sentiment VARCHAR(50),
  concerns TEXT[],
  reminders_delivered UUID[],
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### conversation_turns
```sql
CREATE TABLE conversation_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  speaker VARCHAR(50), -- 'donna' | 'senior'
  content TEXT NOT NULL,
  audio_segment_url TEXT,
  timestamp_offset_ms INTEGER,
  observer_signals JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### scheduled_calls
```sql
CREATE TABLE scheduled_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  senior_id UUID REFERENCES seniors(id),
  type VARCHAR(50), -- 'check_in' | 'reminder' | 'custom'
  scheduled_time TIMESTAMP NOT NULL,
  reminder_ids UUID[],
  status VARCHAR(50), -- 'pending' | 'in_progress' | 'completed' | 'failed'
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  conversation_id UUID REFERENCES conversations(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Phase 3 Tables

#### memories (with pgvector)
```sql
-- Enable pgvector extension first
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  senior_id UUID REFERENCES seniors(id),
  type VARCHAR(50), -- 'fact' | 'preference' | 'event' | 'concern'
  content TEXT NOT NULL,
  source VARCHAR(255), -- conversation_id or 'manual'
  timestamp TIMESTAMP DEFAULT NOW(),
  importance INTEGER, -- 0-100 scale
  embedding VECTOR(1536), -- OpenAI text-embedding-3-small
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for semantic search
CREATE INDEX ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

#### analytics_events
```sql
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(100) NOT NULL,
  senior_id UUID REFERENCES seniors(id),
  caregiver_id UUID REFERENCES caregivers(id),
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 6. Module Architecture

### Module Interface Pattern

Each module follows this structure:

```typescript
// packages/shared/src/interfaces/module-interfaces.ts
export interface IModuleName {
  methodName(params): Promise<ReturnType>;
}

// modules/module-name/src/service.ts
export class ModuleNameService implements IModuleName {
  constructor(
    private dependency1: IDependency1,
    private dependency2: IDependency2
  ) {}

  async methodName(params): Promise<ReturnType> {
    // Implementation
  }
}
```

### Module Inventory (11 Modules)

#### Phase 1: Voice Infrastructure

**1. senior-profiles**
```typescript
interface ISeniorProfiles {
  create(caregiverId: string, data: SeniorData): Promise<Senior>;
  getById(seniorId: string): Promise<Senior | null>;
  list(caregiverId: string, filters?: SeniorFilters): Promise<Senior[]>;
  update(seniorId: string, data: Partial<SeniorData>): Promise<Senior>;
  delete(seniorId: string): Promise<void>;
  getPreferences(seniorId: string): Promise<SeniorPreferences>;
  updatePreferences(seniorId: string, prefs: Partial<SeniorPreferences>): Promise<void>;
}
```

**2. llm-conversation**
```typescript
interface IConversationEngine {
  chat(
    messages: Message[],
    systemPrompt: string,
    options?: ChatOptions
  ): Promise<string>;

  chatStream(
    messages: Message[],
    systemPrompt: string,
    options?: ChatOptions
  ): AsyncIterable<string>;
}
```

**3. skills-system**
```typescript
interface ISkillsSystem {
  registerSkill(skill: ISkill): void;
  executeSkill(name: string, params: SkillParams): Promise<SkillResult>;
  getAvailableSkills(): string[];
}

// Built-in skills:
// - NewsSearchSkill: Fetches personalized news
// - CompanionshipSkill: Companionship conversation patterns
```

**4. voice-pipeline**
```typescript
interface IVoicePipeline {
  transcribe(audioBuffer: Buffer): Promise<string>;
  synthesize(text: string, voiceId?: string, config?: VoiceConfig): Promise<Buffer>;
}
```

**5. conversation-manager**
```typescript
interface IConversationManager {
  create(data: CreateConversationData): Promise<Conversation>;
  addTurn(conversationId: string, turn: ConversationTurn): Promise<void>;
  getHistory(seniorId: string, limit?: number): Promise<Conversation[]>;
  getById(conversationId: string): Promise<Conversation | null>;
  getTurns(conversationId: string): Promise<ConversationTurn[]>;
  updateSummary(conversationId: string, summary: string, sentiment?: string): Promise<void>;
  flagConcern(conversationId: string, concern: string): Promise<void>;
  markReminderDelivered(conversationId: string, reminderId: string): Promise<void>;
}
```

**6. call-orchestrator**
```typescript
interface ICallOrchestrator {
  initiateCall(request: CallRequest): Promise<CallResult>;
  getCallStatus(callId: string): Promise<CallStatus>;
  endCall(callId: string, reason?: string): Promise<void>;
  handleCallEvent(event: TwilioEvent): Promise<void>;
  onCallAnswered(callId: string, handler: CallHandler): void;
  onCallEnded(callId: string, handler: CallHandler): void;
  onCallFailed(callId: string, handler: CallHandler): void;
}
```

#### Phase 2: Data Management

**7. reminder-management**
```typescript
interface IReminderManagement {
  create(seniorId: string, data: ReminderData): Promise<Reminder>;
  list(seniorId: string, filters?: ReminderFilters): Promise<Reminder[]>;
  update(reminderId: string, data: Partial<ReminderData>): Promise<Reminder>;
  delete(reminderId: string): Promise<void>;
  getPendingForSenior(seniorId: string): Promise<Reminder[]>;
  markDelivered(reminderId: string, conversationId: string): Promise<void>;
  getDeliveryHistory(reminderId: string): Promise<DeliveryRecord[]>;
}
```

**8. scheduler-service**
```typescript
interface ISchedulerService {
  scheduleCall(schedule: ScheduleData): Promise<ScheduledCall>;
  cancelScheduledCall(scheduleId: string): Promise<void>;
  getUpcomingCalls(seniorId?: string, limit?: number): Promise<ScheduledCall[]>;
  processSchedule(): Promise<void>; // Called by cron
  retryFailedCall(scheduleId: string): Promise<void>;
  updateSchedule(scheduleId: string, updates: Partial<ScheduleData>): Promise<void>;
}
```

#### Phase 3: AI Enhancement

**9. observer-agent**
```typescript
interface IObserverAgent {
  analyzeConversation(turns: ConversationTurn[]): Promise<ObserverAnalysis>;
  getEngagementLevel(turns: ConversationTurn[]): Promise<number>; // 0-100
  detectEmotionalState(turns: ConversationTurn[]): Promise<EmotionalState>;
  identifyHealthConcerns(turns: ConversationTurn[]): Promise<string[]>;
  suggestOptimalReminderTiming(analysis: ObserverAnalysis): Promise<string>;
}
```

**10. memory-context**
```typescript
interface IMemoryContext {
  storeMemory(seniorId: string, type: MemoryType, content: string, source?: string): Promise<Memory>;
  retrieveMemories(seniorId: string, limit?: number, filters?: MemoryFilters): Promise<Memory[]>;
  getSemanticMatches(seniorId: string, query: string, limit?: number): Promise<Memory[]>;
  buildContext(seniorId: string, conversationId?: string): Promise<ConversationContext>;
  updateMemoryImportance(memoryId: string, importance: number): Promise<void>;
  deleteMemory(memoryId: string): Promise<void>;
}
```

**11. analytics-engine**
```typescript
interface IAnalyticsEngine {
  trackEvent(event: AnalyticsEvent): Promise<void>;
  getMetrics(seniorId?: string, startDate?: Date, endDate?: Date): Promise<Metrics>;
  getSeniorInsights(seniorId: string): Promise<SeniorInsights>;
  getCaregiverDashboard(caregiverId: string): Promise<DashboardData>;
  getEngagementScore(seniorId: string): Promise<number>;
}
```

---

## 7. Adapter Layer

Each adapter wraps an external SDK behind a standard interface.

### Adapter Pattern

```typescript
// adapters/[service]/src/adapter.ts
export class ServiceAdapter implements IServiceAdapter {
  private client: ExternalSDK;

  constructor(config: ServiceConfig) {
    this.client = new ExternalSDK(config.apiKey);
  }

  async method(params): Promise<Result> {
    try {
      return await this.client.sdkMethod(params);
    } catch (error) {
      throw new ExternalServiceError('ServiceName', error.message);
    }
  }
}
```

### Adapter Inventory (6 Adapters)

**1. anthropic**
```typescript
interface IAnthropicAdapter {
  chat(messages: Message[], system?: string, options?: ChatOptions): Promise<string>;
  chatStream(messages: Message[], system?: string, options?: ChatOptions): AsyncIterable<string>;
  getDefaultModel(): string;
}
// SDK: @anthropic-ai/sdk
// Model: claude-sonnet-4-20250514
```

**2. deepgram**
```typescript
interface IDeepgramAdapter {
  transcribeBuffer(buffer: Buffer): Promise<string>;
  transcribeUrl(url: string): Promise<string>;
}
// SDK: @deepgram/sdk
```

**3. elevenlabs**
```typescript
interface IElevenLabsAdapter {
  synthesize(text: string, voiceId?: string, options?: VoiceOptions): Promise<Buffer>;
  getAvailableVoices(): Promise<Voice[]>;
}
// SDK: elevenlabs
// Default Voice ID: "rachel"
```

**4. twilio**
```typescript
interface ITwilioAdapter {
  initiateCall(phoneNumber: string, twimlUrl: string): Promise<string>; // Returns callSid
  endCall(callSid: string): Promise<void>;
  getCallStatus(callSid: string): Promise<CallStatus>;
  recordCall(callSid: string): Promise<void>;
  validateWebhook(request: Request): boolean;
}
// SDK: twilio
```

**5. vercel-blob**
```typescript
interface IStorageAdapter {
  upload(fileName: string, buffer: Buffer, metadata?: object): Promise<string>; // Returns URL
  download(url: string): Promise<Buffer>;
  delete(url: string): Promise<void>;
  getSignedUrl(url: string, expiresIn?: number): Promise<string>;
}
// SDK: @vercel/blob
```

**6. openai**
```typescript
interface IEmbeddingAdapter {
  generateEmbedding(text: string): Promise<number[]>; // 1536 dimensions
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
}
// SDK: openai
// Model: text-embedding-3-small
```

---

## 8. API Routes

### Authentication (`/api/auth`)

| Method | Route | Auth | Request Body | Response |
|--------|-------|------|--------------|----------|
| POST | `/api/auth/register` | None | `{email, password, name}` | `{token, caregiver}` |
| POST | `/api/auth/login` | None | `{email, password}` | `{token, caregiver}` |
| GET | `/api/auth/me` | JWT | - | `{caregiver}` |

### Seniors (`/api/seniors`)

| Method | Route | Auth | Request Body | Response |
|--------|-------|------|--------------|----------|
| GET | `/api/seniors` | JWT | - | `{seniors[]}` |
| POST | `/api/seniors` | JWT | `{name, phone, ...}` | `{senior}` |
| GET | `/api/seniors/:id` | JWT | - | `{senior}` |
| PUT | `/api/seniors/:id` | JWT | `{...updates}` | `{senior}` |
| DELETE | `/api/seniors/:id` | JWT | - | `{success}` |
| GET | `/api/seniors/:id/news` | JWT | - | `{news[]}` |

### Reminders (`/api/reminders`)

| Method | Route | Auth | Request Body | Response |
|--------|-------|------|--------------|----------|
| GET | `/api/reminders/senior/:seniorId` | JWT | - | `{reminders[]}` |
| POST | `/api/reminders` | JWT | `{seniorId, type, title, ...}` | `{reminder}` |
| PUT | `/api/reminders/:id` | JWT | `{...updates}` | `{reminder}` |
| DELETE | `/api/reminders/:id` | JWT | - | `{success}` |

### Conversations (`/api/conversations`)

| Method | Route | Auth | Request Body | Response |
|--------|-------|------|--------------|----------|
| GET | `/api/conversations/senior/:seniorId` | JWT | - | `{conversations[]}` |
| GET | `/api/conversations/:id` | JWT | - | `{conversation, turns[]}` |

### Voice/Calls (`/api/voice`)

| Method | Route | Auth | Request Body | Response |
|--------|-------|------|--------------|----------|
| POST | `/api/voice/call/:seniorId` | JWT | - | `{callSid, status}` |
| POST | `/api/voice/connect` | Twilio | Twilio webhook | TwiML response |
| POST | `/api/voice/status` | Twilio | Twilio webhook | `{success}` |
| POST | `/api/voice/recording` | Twilio | Twilio webhook | `{success}` |

### Health Check

| Method | Route | Response |
|--------|-------|----------|
| GET | `/health` | `{status: 'ok'}` |

---

## 9. Frontend Architecture

### Pages (Next.js App Router)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `page.tsx` | Landing page |
| `/login` | `login/page.tsx` | Caregiver login (Clerk) |
| `/signup` | `signup/page.tsx` | Caregiver registration |
| `/dashboard` | `dashboard/page.tsx` | Main dashboard |
| `/seniors` | `seniors/page.tsx` | Senior list |
| `/seniors/[id]` | `seniors/[id]/page.tsx` | Senior profile |
| `/seniors/[id]/conversations` | Conversation history |

### Key Components

- `SeniorCard` - Senior profile card
- `ReminderForm` - Create/edit reminders
- `ConversationList` - Call history list
- `CallButton` - Initiate call button
- `AnalyticsDashboard` - Metrics visualization

### Styling

- Tailwind CSS with custom config
- Mobile-first responsive design
- Accessible color contrast
- Large touch targets for elderly users

---

## 10. Dependency Injection

### DonnaContainer Class

```typescript
// config/src/dependency-injection.ts
export class DonnaContainer {
  private instances: Map<string, any>;

  constructor(config: DonnaConfig) {
    this.initializeAdapters(config);
    this.initializeModules();
  }

  private initializeAdapters(config: DonnaConfig): void {
    // Initialize and register all adapters
    this.set('AnthropicAdapter', new AnthropicAdapter(config.anthropic));
    this.set('DeepgramAdapter', new DeepgramAdapter(config.deepgram));
    this.set('ElevenLabsAdapter', new ElevenLabsAdapter(config.elevenlabs));
    this.set('TwilioAdapter', new TwilioAdapter(config.twilio));
    this.set('StorageAdapter', new VercelBlobAdapter(config.storage));
    this.set('EmbeddingAdapter', new OpenAIAdapter(config.openai));
    this.set('Database', drizzle(config.databaseUrl));
  }

  private initializeModules(): void {
    // Initialize modules with their dependencies
    const anthropic = this.get<IAnthropicAdapter>('AnthropicAdapter');
    const deepgram = this.get<IDeepgramAdapter>('DeepgramAdapter');
    const elevenlabs = this.get<IElevenLabsAdapter>('ElevenLabsAdapter');
    const twilio = this.get<ITwilioAdapter>('TwilioAdapter');
    const storage = this.get<IStorageAdapter>('StorageAdapter');
    const embedding = this.get<IEmbeddingAdapter>('EmbeddingAdapter');
    const db = this.get('Database');

    // Repositories
    const seniorRepo = new SeniorRepository(db);
    const conversationRepo = new ConversationRepository(db);
    const reminderRepo = new ReminderRepository(db);
    const scheduledCallRepo = new ScheduledCallRepository(db);
    const memoryRepo = new MemoryRepository(db);
    const analyticsRepo = new AnalyticsRepository(db);

    // Services
    this.set('SeniorProfiles', new SeniorProfilesService(seniorRepo));
    this.set('LLMConversation', new LLMConversationService(anthropic));
    this.set('SkillsSystem', new SkillsSystemService(anthropic));
    this.set('VoicePipeline', new VoicePipelineService(deepgram, elevenlabs));
    this.set('ConversationManager', new ConversationManagerService(conversationRepo));
    this.set('CallOrchestrator', new CallOrchestratorService(twilio, ...));
    this.set('ReminderManagement', new ReminderManagementService(reminderRepo));
    this.set('Scheduler', new SchedulerService(scheduledCallRepo, ...));
    this.set('ObserverAgent', new ObserverAgentService(anthropic));
    this.set('MemoryContext', new MemoryContextService(memoryRepo, embedding));
    this.set('AnalyticsEngine', new AnalyticsEngineService(analyticsRepo));
  }

  get<T>(name: string): T { return this.instances.get(name); }
  set(name: string, instance: any): void { this.instances.set(name, instance); }
  has(name: string): boolean { return this.instances.has(name); }
  async shutdown(): Promise<void> { /* cleanup */ }
}
```

### Usage in API

```typescript
// apps/api/src/index.ts
const container = new DonnaContainer(config);
app.set('container', container);

// In routes
app.get('/api/seniors', async (req, res) => {
  const seniorProfiles = req.app.get('container').get<ISeniorProfiles>('SeniorProfiles');
  const seniors = await seniorProfiles.list(req.user.id);
  res.json({ seniors });
});
```

---

## 11. Environment Variables

### Required for All Environments

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/donna

# Authentication
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRES_IN=7d

# Application URLs
API_URL=http://localhost:3001
WEB_URL=http://localhost:3000

NODE_ENV=development
```

### Phase 1: Voice Communication

```bash
# Claude AI
ANTHROPIC_API_KEY=sk-ant-...

# Speech-to-Text
DEEPGRAM_API_KEY=...

# Text-to-Speech
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=rachel

# Phone Calls
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890
```

### Phase 2: Infrastructure

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...

# Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_...

# Redis Queue
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

### Phase 3: AI Enhancement

```bash
# Embeddings for Semantic Search
OPENAI_API_KEY=sk-...
```

---

## 12. Build & Deployment

### Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your API keys

# Run database migrations
npm run db:migrate

# Start all services
npm run dev

# Access points:
# - Web: http://localhost:3000
# - API: http://localhost:3001
# - Health: http://localhost:3001/health
```

### Docker Development

```bash
# Start all services with Docker
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

### Production Deployment

**Option 1: Vercel (Recommended)**
```bash
npm install -g vercel
vercel login
vercel env add DATABASE_URL  # Add all env vars
vercel --prod
```

**Option 2: Railway**

Create `railway.json` in project root:
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Then deploy:
```bash
# Option A: Via CLI
npm install -g railway
railway login
railway init
railway up

# Option B: Via GitHub
# 1. Push code to GitHub
# 2. Go to railway.app
# 3. Click "New Project" > "Deploy from GitHub"
# 4. Select repository and add env vars
```

### Build Commands

```bash
npm run build      # Build all packages
npm run test       # Run all 170 tests
npm run lint       # Lint all code
npm run db:push    # Push schema to database
npm run db:migrate # Run migrations
```

---

## 13. Testing Strategy

### Test Framework

- **Vitest** - Jest-compatible, faster execution
- **vi.mock()** - Mock external SDKs
- **100% pass rate** - 170 tests passing

### Test Structure

Each module/adapter has `__tests__/` directory:

```
modules/voice-pipeline/
├── src/
│   ├── service.ts
│   └── __tests__/
│       └── service.test.ts
└── vitest.config.ts
```

### Test Breakdown

| Component | Tests |
|-----------|-------|
| Voice Pipeline | 10 |
| Conversation Manager | 23 |
| Call Orchestrator | 14 |
| Reminder Management | 17 |
| Scheduler Service | 14 |
| Observer Agent | 14 |
| Memory Context | 23 |
| Analytics Engine | 14 |
| Deepgram Adapter | 5 |
| ElevenLabs Adapter | 9 |
| Twilio Adapter | 12 |
| Vercel Blob Adapter | 7 |
| OpenAI Adapter | 8 |
| **Total** | **170** |

### Running Tests

```bash
npm test                           # All tests
npm test modules/voice-pipeline    # Specific module
npm test -- --coverage             # With coverage
npm test -- --watch                # Watch mode
```

### Manual Test UIs

Access after starting server:
- Phase 1: `http://localhost:3001/test/test-phase1.html`
- Phase 2: `http://localhost:3001/test/test-phase2.html`
- Phase 3: `http://localhost:3001/test/test-phase3.html`

---

## 14. Design Patterns

### 1. Interface-First Design

All communication through TypeScript interfaces, never direct imports.

```typescript
// ❌ BAD
import { DeepgramClient } from '@deepgram/sdk';

// ✅ GOOD
import { IDeepgramAdapter } from '@donna/shared/interfaces';
```

### 2. Dependency Injection

All dependencies injected via constructor.

```typescript
class ServiceA {
  constructor(
    private dep1: IDep1,
    private dep2: IDep2
  ) {}
}
```

### 3. Repository Pattern

Separate data access from business logic.

```typescript
// Repository: DB operations only
class SeniorRepository {
  async create(data): Promise<Senior> {
    return this.db.insert(seniors).values(data).returning();
  }
}

// Service: Business logic
class SeniorProfilesService {
  constructor(private repo: ISeniorRepository) {}

  async create(caregiverId, data): Promise<Senior> {
    // Business rules here
    return this.repo.create(data);
  }
}
```

### 4. Adapter Pattern

Wrap external SDKs behind standard interfaces.

```typescript
class DeepgramAdapter implements IDeepgramAdapter {
  private client: DeepgramSDK;

  async transcribeBuffer(buffer: Buffer): Promise<string> {
    // Wrap SDK call
  }
}
```

### 5. Type-Safe Database with Drizzle

Full TypeScript inference from schema.

```typescript
// Types auto-inferred
type Senior = typeof seniors.$inferSelect;
type NewSenior = typeof seniors.$inferInsert;
```

---

## 15. Implementation Order

### Phase 1: Voice Infrastructure (Days 1-3)

1. Set up monorepo with Turborepo
2. Create shared interfaces package
3. Implement adapters:
   - Anthropic
   - Deepgram
   - ElevenLabs
   - Twilio
4. Implement modules:
   - senior-profiles
   - llm-conversation
   - skills-system
   - voice-pipeline
   - conversation-manager
   - call-orchestrator
5. Create API routes
6. Write tests (73 tests)

### Phase 2: Data Management (Days 4-5)

1. Set up Neon PostgreSQL
2. Create Drizzle schema
3. Implement Vercel Blob adapter
4. Implement modules:
   - reminder-management
   - scheduler-service
5. Set up Upstash Redis for BullMQ
6. Write tests (38 tests)

### Phase 3: AI Enhancement (Days 6-7)

1. Implement OpenAI adapter (embeddings)
2. Enable pgvector extension
3. Implement modules:
   - observer-agent
   - memory-context
   - analytics-engine
4. Write tests (59 tests)

### Phase 4: Frontend & Polish (Days 8+)

1. Build Next.js caregiver portal
2. Integrate Clerk authentication
3. Create test UIs
4. Documentation
5. Production deployment

---

## Quick Reference

### Start Development
```bash
git clone <repo>
cd donna-agent-5
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

### Run Tests
```bash
npm test
```

### Deploy
```bash
vercel --prod
```

### Key Files
- Interfaces: `/packages/shared/src/interfaces/module-interfaces.ts`
- DI Container: `/config/src/dependency-injection.ts`
- Database Schema: `/database/src/schema.ts`
- API Entry: `/apps/api/src/index.ts`
- Web Entry: `/apps/web/src/app/page.tsx`

---

**This guide contains everything needed to rebuild Donna from scratch. Follow the implementation order, use the exact dependencies listed, and reference the interface definitions for each module.**
