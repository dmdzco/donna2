# Production Security & Architecture TODO

**Purpose:** Infrastructure, security, and architecture improvements for production readiness.
**Scope:** This document covers technical hardening only. Product features are tracked in [NEXT_STEPS.md](./NEXT_STEPS.md).
**Last Updated:** January 2026

---

## Current Production Readiness: 62%

| Category | Grade | Target | Progress |
|----------|-------|--------|----------|
| Security | D → **C+** | A | Zod ✅ Twilio ✅ Rate Limit ✅ (Auth pending) |
| Scalability | C → | B+ | |
| Reliability | C → | B+ | |
| Testing | F → | B | |
| Observability | D → | B | |

---

## 🔴 CRITICAL (Before Real User Data)

### 1. Authentication (Clerk)
**Risk:** All API endpoints exposed. Anyone can read PII, initiate calls, delete data.
**Impact:** HIPAA violation, abuse potential, no audit trail.

- [ ] Install Clerk SDK (`@clerk/express`, `@clerk/clerk-react`)
- [ ] Add Clerk middleware to protect `/api/*` routes
- [ ] Exclude Twilio webhooks from auth (`/voice/*`)
- [ ] Add Clerk to admin dashboard (`apps/admin/`)
- [ ] Create user-senior relationships table
- [ ] Filter API responses by user's assigned seniors
- [ ] Add audit logging for sensitive operations

**Files:** `index.js`, `apps/admin/src/App.tsx`, `db/schema.js`
**Effort:** 2-3 weeks

---

### 2. ~~Input Validation (Zod)~~ ✅ DONE
**Status:** Implemented January 2026

- [x] Install Zod
- [x] Create `validators/schemas.js` with all schemas
- [x] Create `middleware/validate.js`
- [x] Add validation to all POST/PATCH endpoints
- [x] Standardized error response format

---

### 3. ~~Twilio Webhook Signature Verification~~ ✅ DONE
**Status:** Implemented January 2026

- [x] Import `twilio.validateRequest()`
- [x] Create middleware in `middleware/twilio.js`
- [x] Apply to `/voice/answer` and `/voice/status`
- [x] Reject requests without valid signature (return 403)
- [x] Development mode: allows localhost requests with warning

---

### 4. ~~Rate Limiting~~ ✅ DONE
**Status:** Implemented January 2026

- [x] Install `express-rate-limit`
- [x] Global API rate limit (100 req/min per IP)
- [x] Strict call limiter (5 calls/min per IP) on `/api/call`
- [x] Write limiter (30 req/min) on POST/PATCH/DELETE endpoints
- [x] Auth limiter (10 req/min) ready for Clerk integration
- [x] Proper 429 responses with `Retry-After` header

**Files:** `middleware/rate-limit.js`, `index.js`

---

## 🟠 HIGH (Before 100+ Users)

### 5. Testing Infrastructure
**Risk:** Cannot safely refactor. Cannot verify fixes. No regression protection.

#### Phase 1: Setup (Week 1)
- [ ] Install Vitest + testing-library
- [ ] Create `vitest.config.ts`
- [ ] Set up test database (separate from prod)
- [ ] Add `npm run test` script
- [ ] Create first passing test

#### Phase 2: Critical Path Tests (Weeks 2-4)
- [ ] Memory service tests
  - [ ] `store()` with deduplication
  - [ ] `search()` semantic matching
  - [ ] Decay calculation
- [ ] Validation schema tests
  - [ ] Valid inputs pass
  - [ ] Invalid inputs rejected with correct errors
- [ ] Quick Observer tests
  - [ ] Health pattern detection
  - [ ] Safety pattern detection
  - [ ] Medication pattern detection

#### Phase 3: Integration Tests (Weeks 5-6)
- [ ] API endpoint tests
  - [ ] CRUD operations for seniors
  - [ ] Reminder creation/delivery
- [ ] Conversation flow tests (mocked LLMs)

**Target:** 60% coverage on services/
**Files:** `__tests__/`, `vitest.config.ts`
**Effort:** 4-6 weeks

---

### 6. Redis Session Store
**Risk:** Cannot scale horizontally. Server restart kills active calls. Memory leaks.

**Current:**
```javascript
const sessions = new Map();        // In-memory, single instance only
const callMetadata = new Map();    // Lost on restart
```

**Target:**
```javascript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

// Store session metadata (not the WebSocket itself)
await redis.hset(`session:${callSid}`, { seniorId, startedAt, ... });
await redis.expire(`session:${callSid}`, 3600); // 1hr TTL
```

- [ ] Add Redis to Railway (or use Upstash)
- [ ] Install `ioredis`
- [ ] Create `services/session-store.js`
- [ ] Store session metadata in Redis
- [ ] Store call metadata in Redis
- [ ] Add TTL for automatic cleanup
- [ ] Update session lookups to use Redis

**Note:** Active WebSocket connections still live in memory. Redis stores metadata for recovery and multi-instance awareness.

**Files:** `services/session-store.js`, `index.js`
**Effort:** 1 week

---

### 7. Route Extraction
**Risk:** 1000+ line index.js is hard to maintain, review, and debug.

**Target structure:**
```
routes/
├── index.js          # Route aggregator
├── seniors.js        # /api/seniors/*
├── calls.js          # /api/call, /api/calls/*
├── reminders.js      # /api/reminders/*
├── memories.js       # /api/seniors/:id/memories/*
├── conversations.js  # /api/conversations/*
├── observability.js  # /api/observability/*
└── voice.js          # /voice/* (Twilio webhooks)

websocket/
└── media-stream.js   # WebSocket handler
```

- [ ] Create `routes/` directory
- [ ] Extract senior routes
- [ ] Extract reminder routes
- [ ] Extract call routes
- [ ] Extract voice webhook routes
- [ ] Extract observability routes
- [ ] Extract WebSocket handler to `websocket/`
- [ ] Reduce `index.js` to <150 lines (setup only)

**Files:** `routes/*.js`, `websocket/*.js`, `index.js`
**Effort:** 1 week

---

### 8. Error Recovery & Circuit Breakers
**Risk:** One API timeout cascades into broken call. Silent failures hide problems.

#### Retry Logic
- [ ] Install `p-retry` or implement exponential backoff
- [ ] Add retries to Claude API calls (2 retries, 1s backoff)
- [ ] Add retries to ElevenLabs TTS (2 retries)
- [ ] Add retries to Deepgram STT connection
- [ ] Add retries to database operations

#### Circuit Breakers
- [ ] Install `opossum` circuit breaker library
- [ ] Wrap Claude adapter with circuit breaker
- [ ] Wrap ElevenLabs adapter with circuit breaker
- [ ] Define fallback behavior (graceful degradation)
- [ ] Add circuit state to health check

```javascript
import CircuitBreaker from 'opossum';

const claudeBreaker = new CircuitBreaker(claudeCall, {
  timeout: 10000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

claudeBreaker.fallback(() => ({
  content: "I'm having trouble right now. Can you repeat that?"
}));
```

**Files:** `adapters/llm/*.js`, `adapters/elevenlabs*.js`
**Effort:** 2 weeks

---

## 🟡 MEDIUM (Before 500+ Users)

### 9. TypeScript Migration
**Risk:** Runtime errors, no IDE support, hard to onboard new developers.

**Migration order:**
1. [ ] `packages/types/` - Create shared types first
2. [ ] `validators/` - Already well-defined schemas
3. [ ] `services/` - Business logic
4. [ ] `adapters/` - External integrations
5. [ ] `pipelines/` - Voice logic
6. [ ] `routes/` - After extraction
7. [ ] `index.ts` - Last

- [ ] Add `tsconfig.json` to root
- [ ] Configure path aliases
- [ ] Set up incremental migration (allow .js imports)
- [ ] Add `npm run typecheck` script

**Effort:** 6-8 weeks (can be done incrementally)

---

### 10. Structured Logging (Pino)
**Risk:** Can't filter logs in production. PII in plaintext. No log levels.

**Current:** 212 `console.log` statements with inconsistent formats.

**Target:**
```javascript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['senior.phone', 'senior.medicalNotes', 'transcript'],
});

logger.info({ callSid, seniorId }, 'Call started');
logger.error({ err, callSid }, 'Claude API failed');
```

- [ ] Install `pino` and `pino-pretty` (dev)
- [ ] Create `lib/logger.js`
- [ ] Define log levels (debug, info, warn, error)
- [ ] Add PII redaction rules
- [ ] Replace `console.log` statements (search for 212 occurrences)
- [ ] Add request ID to all logs
- [ ] Configure JSON output for production

**Files:** `lib/logger.js`, all files with console.log
**Effort:** 1 week

---

### 11. Observability (OpenTelemetry)
**Risk:** No visibility into production performance. Can't debug latency issues.

- [ ] Install OpenTelemetry SDK
- [ ] Add tracing to HTTP requests
- [ ] Add tracing to LLM calls (Claude, Gemini)
- [ ] Add tracing to TTS/STT calls
- [ ] Add tracing to database queries
- [ ] Export to Honeycomb/Jaeger/etc.
- [ ] Create dashboard for key metrics:
  - Time-to-first-audio
  - LLM latency (p50, p95, p99)
  - Error rates by service
  - Active call count

**Effort:** 2 weeks

---

### 12. Database Connection Pool
**Risk:** Connection exhaustion under load. No timeout handling.

**Current:**
```javascript
const pool = new Pool({ connectionString: DATABASE_URL });
// No configuration
```

**Target:**
```javascript
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,                    // Max connections
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Fail fast if can't connect
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database error');
});
```

- [ ] Add pool configuration in `db/client.js`
- [ ] Add connection error handling
- [ ] Add pool metrics to health check
- [ ] Test under load

**Files:** `db/client.js`
**Effort:** 2 days

---

### 13. Graceful Shutdown
**Risk:** Deploys kill active calls. Memories not extracted from in-progress calls.

- [ ] Handle SIGTERM/SIGINT signals
- [ ] Stop accepting new connections
- [ ] Wait for active calls to complete (with timeout)
- [ ] Extract memories from in-progress calls
- [ ] Close database connections
- [ ] Close Redis connections

```javascript
process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');

  // Stop accepting new calls
  server.close();

  // Wait for active calls (max 30s)
  const timeout = setTimeout(() => {
    logger.warn('Forcing shutdown after timeout');
    process.exit(1);
  }, 30000);

  // Close all sessions
  for (const [callSid, session] of sessions) {
    await session.close();
  }

  clearTimeout(timeout);
  await pool.end();
  process.exit(0);
});
```

**Files:** `index.js`
**Effort:** 1 day

---

### 14. Enhanced Health Check
**Risk:** Health check says "ok" even when dependencies are down.

**Current:** Only checks if server is running.

**Target:**
```javascript
app.get('/health', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    deepgram: await checkDeepgram(),
    elevenlabs: await checkElevenLabs(),
  };

  const healthy = Object.values(checks).every(c => c.status === 'ok');

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks,
    activeSessions: sessions.size,
    uptime: process.uptime(),
  });
});
```

- [ ] Add database connectivity check
- [ ] Add Redis connectivity check
- [ ] Add external service checks (with caching)
- [ ] Return 503 if critical services down
- [ ] Add uptime and memory usage

**Files:** `index.js` or `routes/health.js`
**Effort:** 4 hours

---

## 🔵 LOW (Nice to Have)

### 15. API Versioning
- [ ] Add `/api/v1/` prefix to all routes
- [ ] Keep `/api/` as alias for v1 (backwards compat)
- [ ] Document versioning strategy

### 16. OpenAPI Documentation
- [ ] Generate OpenAPI spec from Zod schemas
- [ ] Add Swagger UI at `/api/docs`
- [ ] Keep spec in sync with code

### 17. Security Headers
- [ ] Add Helmet middleware
- [ ] Configure CSP for admin dashboard
- [ ] Add HSTS headers

### 18. Secrets Management
- [ ] Move from .env to Railway secrets
- [ ] Rotate API keys
- [ ] Document secret rotation process

---

## Checklist Summary

### Before Real Users (CRITICAL)
- [ ] Authentication (Clerk)
- [x] Input Validation (Zod) ✅
- [x] Twilio Webhook Verification ✅
- [x] Rate Limiting ✅

### Before 100 Users (HIGH)
- [ ] Testing Infrastructure (60% coverage)
- [ ] Redis Session Store
- [ ] Route Extraction
- [ ] Error Recovery

### Before 500 Users (MEDIUM)
- [ ] TypeScript Migration
- [ ] Structured Logging
- [ ] OpenTelemetry
- [ ] Database Pool Config
- [ ] Graceful Shutdown
- [ ] Enhanced Health Check

---

## Estimated Timeline

| Phase | Items | Effort |
|-------|-------|--------|
| Week 1-3 | Auth + Webhook + Rate Limit | 3 weeks |
| Week 4-5 | Route Extraction + Redis | 2 weeks |
| Week 6-11 | Testing Infrastructure | 6 weeks |
| Week 12-13 | Error Recovery | 2 weeks |
| Week 14-15 | Logging + Health | 2 weeks |
| Week 16-23 | TypeScript (incremental) | 8 weeks |
| Week 24-25 | OpenTelemetry | 2 weeks |

**Total:** ~6 months for full production hardening

---

*This document tracks infrastructure work only. Product features (Telnyx migration, greeting rotation, caregiver notifications, etc.) are tracked in [NEXT_STEPS.md](./NEXT_STEPS.md).*
