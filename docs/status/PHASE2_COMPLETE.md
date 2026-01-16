# Phase 2 Reference - Infrastructure & Data Management

> **Note:** This document describes the database and scheduling infrastructure for the full architecture. This corresponds to **Milestones 7-10** in the incremental build. Start with [INCREMENTAL_BUILD_GUIDE.md](../INCREMENTAL_BUILD_GUIDE.md) for the milestone-based approach.

**Original Implementation:** January 2026
**Tests:** 38/38 passing (100%)

---

## 🎯 What Was Built

Phase 2 was split into two parts: **Infrastructure Migration (Phase 2A)** and **Business Modules (Phase 2B)**.

---

## Phase 2A: Infrastructure Migration to Serverless ✅

### **Why Migrate to Serverless?**

**Before (Self-Hosted):**
- PostgreSQL (requires server management)
- Redis (requires server management)
- Custom JWT authentication
- S3/MinIO for storage

**After (Serverless):**
- Neon (serverless PostgreSQL, auto-scaling, 0ms cold starts)
- Upstash (serverless Redis, pay-per-use)
- Clerk (managed authentication)
- Cloud Storage (CDN-backed storage)

**Benefits:**
- ✅ Pay only for what you use
- ✅ Zero infrastructure management
- ✅ Auto-scaling with demand
- ✅ Built-in backups and monitoring
- ✅ Faster deployment

---

### 1. Drizzle ORM Integration

**Location:** `database/schema.ts`
**Purpose:** Type-safe database access with TypeScript inference

#### **Complete Schema Migrated:**

```typescript
// All tables now use Drizzle ORM with type safety
export const caregivers = pgTable('caregivers', { ... });
export const seniors = pgTable('seniors', { ... });
export const conversations = pgTable('conversations', { ... });
export const conversationTurns = pgTable('conversation_turns', { ... });
export const reminders = pgTable('reminders', { ... });
export const scheduledCalls = pgTable('scheduled_calls', { ... });
export const memories = pgTable('memories', { ... });
export const analyticsEvents = pgTable('analytics_events', { ... });
```

#### **Benefits:**
- ✅ Full TypeScript type inference (`$inferSelect`, `$inferInsert`)
- ✅ Zero runtime overhead
- ✅ Migration generation built-in
- ✅ Better developer experience than raw SQL

#### **Repository Pattern Updated:**

All repositories now use Drizzle instead of raw `pg.Pool`:

**Before:**
```typescript
const result = await this.pool.query(
  'SELECT * FROM seniors WHERE id = $1',
  [id]
);
```

**After:**
```typescript
const [senior] = await this.db
  .select()
  .from(seniors)
  .where(eq(seniors.id, id))
  .limit(1);
```

---

### 2. Neon Database Setup

**Service:** Neon (https://neon.tech)
**Connection:** Serverless HTTP-based PostgreSQL

#### **Features:**
- Auto-scaling storage (0ms cold starts)
- Connection pooling built-in
- Database branching (like Git for databases)
- Built-in backups

#### **Environment Variable:**
```bash
DATABASE_URL=postgresql://user:pass@ep-cool-grass-123456.us-east-2.aws.neon.tech/donna?sslmode=require
```

---

### 3. Clerk Authentication

**Service:** Clerk (https://clerk.com)
**Replaced:** Custom UserManagement module (JWT + bcrypt)

#### **Why Clerk?**
- ✅ Social login (Google, GitHub, etc.) out of the box
- ✅ Session management
- ✅ User webhooks for sync
- ✅ Pre-built UI components
- ✅ Secure by default

#### **Environment Variables:**
```bash
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

#### **Impact:**
- **Removed:** Custom UserManagement module (no longer needed)
- **Added:** Clerk SDK integration in Next.js frontend
- **Simplified:** Authentication flow (no custom JWT handling)

---

## Phase 2B: Business Modules ✅

### 1. Reminder Management Module

**Location:** `modules/reminder-management/`
**Tests:** 17/17 passing ✅
**Interface:** `IReminderManagement`

#### **Purpose:**
CRUD operations for medication and appointment reminders

#### **Capabilities:**
- `create()` - Create new reminder (validates senior exists)
- `getById()` - Fetch reminder by ID
- `list()` - List all reminders for a senior
- `update()` - Update reminder details
- `delete()` - Remove reminder
- `getPending()` - Get pending reminders due for delivery
- `markDelivered()` - Track when reminder was delivered

#### **Database Schema (Drizzle):**
```typescript
export const reminders = pgTable('reminders', {
  id: uuid('id').defaultRandom().primaryKey(),
  seniorId: uuid('senior_id').notNull().references(() => seniors.id),
  caregiverId: uuid('caregiver_id').notNull().references(() => caregivers.id),
  type: varchar('type', { length: 50 }).notNull(), // 'medication' | 'appointment'
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  scheduledTime: timestamp('scheduled_time').notNull(),
  recurrence: varchar('recurrence', { length: 50 }), // 'daily' | 'weekly' | 'monthly'
  deliveredAt: timestamp('delivered_at'),
  status: varchar('status', { length: 50 }).default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

#### **Key Features:**
- ✅ Type-safe with Drizzle ORM
- ✅ Validates senior exists before creating reminder
- ✅ Supports recurring reminders (daily, weekly, monthly)
- ✅ Tracks delivery status
- ✅ Repository pattern for data access

---

### 2. Scheduler Service Module

**Location:** `modules/scheduler-service/`
**Tests:** 14/14 passing ✅
**Interface:** `ISchedulerService`

#### **Purpose:**
Automated call scheduling with BullMQ job queue and Upstash Redis

#### **Capabilities:**
- `scheduleCall()` - Schedule a call for a specific time
- `getUpcomingCalls()` - List scheduled calls
- `cancelScheduledCall()` - Cancel a scheduled call
- `retryFailedCall()` - Retry a failed call with exponential backoff
- `processSchedule()` - Execute scheduled calls (runs automatically)

#### **Architecture:**

```
Scheduler Service
    │
    ├─► BullMQ Queue
    │     └─► Upstash Redis (job storage)
    │
    └─► Call Orchestrator (executes the call)
```

#### **Database Schema (Drizzle):**
```typescript
export const scheduledCalls = pgTable('scheduled_calls', {
  id: uuid('id').defaultRandom().primaryKey(),
  seniorId: uuid('senior_id').notNull().references(() => seniors.id),
  scheduledTime: timestamp('scheduled_time').notNull(),
  reminderIds: jsonb('reminder_ids'),
  status: varchar('status', { length: 50 }).default('pending'),
  executedAt: timestamp('executed_at'),
  failureReason: text('failure_reason'),
  retryCount: integer('retry_count').default(0),
  maxRetries: integer('max_retries').default(3),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

#### **Key Features:**
- ✅ BullMQ job queue with persistent storage (Upstash Redis)
- ✅ Automated retry logic with exponential backoff
- ✅ Tracks retry count and failure reasons
- ✅ Supports scheduling calls with reminder delivery
- ✅ Worker automatically processes scheduled jobs

#### **Upstash Redis Integration:**

**Service:** Upstash (https://upstash.com)
**Why Upstash?**
- Serverless Redis (pay-per-request)
- REST API (no persistent connections needed)
- Built-in durability for job queues

**Environment Variables:**
```bash
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here
```

---

### 3. Cloud Storage Adapter (Storage)

**Location:** `adapters/storage/`
**Tests:** 7/7 passing ✅
**Interface:** `IStorageAdapter`

#### **Purpose:**
Store call recordings and audio files in Cloud Storage storage

#### **Capabilities:**
- `uploadAudio()` - Upload audio buffer to Blob storage
- `getSignedUrl()` - Generate signed URL for secure access
- `deleteAudio()` - Remove audio file
- `listAudioFiles()` - List all audio files for a conversation

#### **Why Cloud Storage?**
- ✅ CDN-backed (fast global delivery)
- ✅ Simple API (no S3 complexity)
- ✅ Automatic HTTPS
- ✅ Pay-per-use pricing
- ✅ Integrates seamlessly with Cloud deployment

#### **Environment Variable:**
```bash
BLOB_READ_WRITE_TOKEN=storage_rw_...
```

#### **Usage Example:**
```typescript
// Upload call recording
const url = await storageAdapter.uploadAudio(
  'conv-123',
  audioBuffer,
  'audio/mpeg'
);
// Returns: https://your-storage.example.com/conversations/conv-123/recording.mp3

// Generate signed URL (expires in 1 hour)
const signedUrl = await storageAdapter.getSignedUrl(url, { expiresIn: 3600 });
```

---

## 🌐 Web-Based Test UI

A browser-based testing interface for Phase 2 modules is available at:

**URL:** `http://localhost:3001/test/test-phase2.html`

### Features:
1. **Reminder Management Test**
   - Create reminders
   - List reminders for a senior
   - Get pending reminders
   - Mark reminder as delivered
   - Delete reminders

2. **Scheduler Service Test**
   - Schedule a call
   - List upcoming calls
   - Cancel scheduled call
   - Retry failed call

3. **Storage Adapter Test**
   - Upload audio file
   - Generate signed URL
   - List audio files
   - Delete audio file

### How to Use:

1. **Start the API server:**
   ```bash
   cd apps/api
   npm run dev
   ```

2. **Open in browser:**
   ```
   http://localhost:3001/test/test-phase2.html
   ```

3. **Test individual components:**
   - Enter a senior ID
   - Fill in reminder details or schedule time
   - Click test buttons
   - View real-time responses

---

## 📦 Dependency Injection Updates

All Phase 2 modules are registered in `config/dependency-injection.ts`:

```typescript
// Phase 2B: Business Modules
const reminderRepository = new ReminderRepository(db);
const reminderManagement = new ReminderManagementService(
  reminderRepository,
  seniorProfiles
);
this.set('ReminderManagement', reminderManagement);

const scheduledCallRepository = new ScheduledCallRepository(db);
const scheduler = new SchedulerService(
  scheduledCallRepository,
  this.get<ICallOrchestrator>('CallOrchestrator'),
  this.config.redis
);
this.set('Scheduler', scheduler);

const storageAdapter = new StorageAdapter({
  token: this.config.storage.token,
});
this.set('StorageAdapter', storageAdapter);
```

**Usage in your code:**
```typescript
const container = DonnaContainer.getInstance();

// Reminder Management
const reminderMgmt = container.get<IReminderManagement>('ReminderManagement');
const reminder = await reminderMgmt.create('senior-123', {
  type: 'medication',
  title: 'Take aspirin',
  scheduledTime: new Date('2026-01-15T09:00:00Z'),
});

// Scheduler Service
const scheduler = container.get<ISchedulerService>('Scheduler');
await scheduler.scheduleCall({
  seniorId: 'senior-123',
  scheduledTime: new Date('2026-01-15T14:00:00Z'),
  reminderIds: [reminder.id],
});

// Storage Adapter
const storage = container.get<IStorageAdapter>('StorageAdapter');
const audioUrl = await storage.uploadAudio('conv-123', audioBuffer, 'audio/mpeg');
```

---

## 🔐 Environment Variables

Updated `.env.example` with Phase 2 requirements:

```bash
# === PHASE 2A: INFRASTRUCTURE (REQUIRED) ===
# Database (Neon)
DATABASE_URL=postgresql://user:pass@ep-cool-grass-123456.us-east-2.aws.neon.tech/donna?sslmode=require

# Authentication (Clerk)
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# === PHASE 2B: BUSINESS MODULES (REQUIRED) ===
# Storage (Cloud Storage)
BLOB_READ_WRITE_TOKEN=storage_rw_...

# Job Queue (Upstash Redis)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here

# === PHASE 1: VOICE (REQUIRED) ===
ANTHROPIC_API_KEY=sk-ant-...
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=rachel
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# === APPLICATION CONFIG ===
API_URL=http://localhost:3001
WEB_URL=http://localhost:3000
JWT_SECRET=your_jwt_secret_min_32_chars_long
```

---

## 🏃 Running Tests

### Run All Phase 2 Tests:
```bash
npm test modules/reminder-management
npm test modules/scheduler-service
npm test adapters/storage
```

### Run Individual Module Tests:
```bash
cd modules/reminder-management && npm test
cd modules/scheduler-service && npm test
cd adapters/storage && npm test
```

### Run Tests in Watch Mode:
```bash
cd modules/reminder-management && npm test -- --watch
```

---

## 📊 Test Coverage Summary

| Component | Tests | Status |
|-----------|-------|--------|
| **Phase 2B Modules** | | |
| Reminder Management | 17/17 | ✅ |
| Scheduler Service | 14/14 | ✅ |
| **Adapters** | | |
| Cloud Storage | 7/7 | ✅ |
| **TOTAL** | **38/38** | **✅ 100%** |

---

## 🔧 Database Migrations

### Tables Created/Updated:

1. **reminders** - Medication and appointment reminders
2. **scheduled_calls** - Scheduled call records with retry tracking

### Running Migrations:

```bash
# Generate migrations from Drizzle schema
npm run db:generate

# Apply migrations to database
npm run db:migrate
```

---

## 🎯 Next Steps (Phase 3)

Phase 2 is **complete**. Ready to proceed with Phase 3:

### Phase 3 Modules:
1. **Observer Agent** - Real-time conversation quality analysis
2. **Memory & Context** - Long-term memory storage and context building
3. **Analytics Engine** - Usage metrics and insights

---

## 📝 Key Changes from Phase 1

### Infrastructure:
- ✅ **Removed:** Direct `pg.Pool` queries
- ✅ **Added:** Drizzle ORM for type safety
- ✅ **Migrated:** All repositories to use Drizzle
- ✅ **Removed:** Custom UserManagement module
- ✅ **Added:** Clerk authentication

### Architecture:
- ✅ Serverless PostgreSQL (Neon)
- ✅ Serverless Redis (Upstash)
- ✅ Serverless storage (Cloud Storage)
- ✅ Managed authentication (Clerk)

### Developer Experience:
- ✅ Full TypeScript type inference
- ✅ Better error messages (Drizzle)
- ✅ No server management required
- ✅ Pay-per-use pricing

---

## 🚀 Deployment Checklist

Before deploying Phase 2 to production:

- [ ] Create Neon database
- [ ] Run database migrations
- [ ] Set up Clerk account and webhooks
- [ ] Create Upstash Redis instance
- [ ] Set up Cloud Storage storage
- [ ] Set all environment variables
- [ ] Test scheduled call flow
- [ ] Verify BullMQ worker is running
- [ ] Test audio upload/retrieval

---

## 📚 Documentation

- **Main README:** `/README.md`
- **Architecture Overview:** `/docs/architecture/OVERVIEW.md`
- **Deployment Guide:** `/docs/guides/DEPLOYMENT_PLAN.md`
- **Environment Setup:** `/.env.example`
- **Test UI:** `/apps/api/public/test-phase2.html`

---

## 🎉 Summary

**Phase 2 is complete and production-ready!**

- ✅ Infrastructure migrated to serverless (Drizzle, Neon, Clerk, Upstash, Cloud Storage)
- ✅ 3 new modules implemented (Reminder Management, Scheduler Service, Cloud Storage Adapter)
- ✅ 38/38 tests passing (100% pass rate)
- ✅ All repositories use Drizzle ORM
- ✅ DI container updated
- ✅ Web test UI created
- ✅ Environment variables documented
- ✅ All code committed to GitHub

**Total implementation:**
- Infrastructure migration: Complete ✅
- New modules: 3 ✅
- Tests: 38 passing ✅
- Database schema: Extended ✅

**Combined with Phase 1:**
- Total modules: 9 business modules + 4 adapters
- Total tests: 111/111 passing (100%)

Ready to proceed with Phase 3! 🚀
