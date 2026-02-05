# Security & Infrastructure Todos

> Production readiness: 72% | CRITICAL: 4/4 done

---

## CRITICAL - Before Real User Data

All complete.

### Authentication (Clerk)
- id: sec-auth
- status: completed
- effort: 3 weeks
- files: `middleware/auth.js`, `index.js`, `db/schema.js`

**Completed January 2026:**
- [x] Install Clerk SDK (`@clerk/express`)
- [x] Add Clerk middleware to protect `/api/*` routes
- [x] Exclude Twilio webhooks from auth (`/voice/*`)
- [x] Cofounder API key fallback
- [x] Create `caregivers` table for user-senior relationships
- [x] Filter API responses by user's assigned seniors
- [x] Admin role sees all, caregivers see assigned seniors only

---

### Input Validation (Zod)
- id: sec-validation
- status: completed
- effort: 1 week
- files: `validators/schemas.js`, `middleware/validate.js`

**Completed January 2026:**
- [x] Install Zod
- [x] Create `validators/schemas.js` with all schemas
- [x] Create `middleware/validate.js`
- [x] Add validation to all POST/PATCH endpoints
- [x] Standardized error response format

---

### Twilio Webhook Signature Verification
- id: sec-twilio-verify
- status: completed
- effort: 2 days
- files: `middleware/twilio.js`

**Completed January 2026:**
- [x] Import `twilio.validateRequest()`
- [x] Create middleware in `middleware/twilio.js`
- [x] Apply to `/voice/answer` and `/voice/status`
- [x] Reject requests without valid signature (return 403)
- [x] Development mode: allows localhost requests with warning

---

### Rate Limiting
- id: sec-rate-limit
- status: completed
- effort: 2 days
- files: `middleware/rate-limit.js`, `index.js`

**Completed January 2026:**
- [x] Install `express-rate-limit`
- [x] Global API rate limit (100 req/min per IP)
- [x] Strict call limiter (5 calls/min per IP) on `/api/call`
- [x] Write limiter (30 req/min) on POST/PATCH/DELETE endpoints
- [x] Auth limiter (10 req/min) ready for Clerk integration
- [x] Proper 429 responses with `Retry-After` header

---

## HIGH - Before 100+ Users

### Testing Infrastructure
- id: sec-testing
- status: pending
- effort: 4-6 weeks
- depends_on: none
- files: `__tests__/`, `vitest.config.ts`

**Risk:** Cannot safely refactor. Cannot verify fixes. No regression protection.

**Phase 1: Setup (Week 1)**
- [ ] Install Vitest + testing-library
- [ ] Create `vitest.config.ts`
- [ ] Set up test database (separate from prod)
- [ ] Add `npm run test` script
- [ ] Create first passing test

**Phase 2: Critical Path Tests (Weeks 2-4)**
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

**Phase 3: Integration Tests (Weeks 5-6)**
- [ ] API endpoint tests
  - [ ] CRUD operations for seniors
  - [ ] Reminder creation/delivery
- [ ] Conversation flow tests (mocked LLMs)

**Success criteria:** 60% coverage on services/

---

### Redis Session Store
- id: sec-redis
- status: pending
- effort: 1 week
- depends_on: none
- files: `services/session-store.js`, `index.js`

**Risk:** Cannot scale horizontally. Server restart kills active calls. Memory leaks.

**Current state:**
```javascript
const sessions = new Map();        // In-memory, single instance only
const callMetadata = new Map();    // Lost on restart
```

**Tasks:**
- [ ] Add Redis to Railway (or use Upstash)
- [ ] Install `ioredis`
- [ ] Create `services/session-store.js`
- [ ] Store session metadata in Redis
- [ ] Store call metadata in Redis
- [ ] Add TTL for automatic cleanup (1hr)
- [ ] Update session lookups to use Redis

**Note:** Active WebSocket connections still live in memory. Redis stores metadata for recovery and multi-instance awareness.

---

### Route Extraction
- id: sec-routes
- status: pending
- effort: 1 week
- depends_on: none
- files: `routes/*.js`, `websocket/*.js`, `index.js`

**Risk:** 972-line index.js is hard to maintain, review, and debug.

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

**Tasks:**
- [ ] Create `routes/` directory
- [ ] Extract senior routes
- [ ] Extract reminder routes
- [ ] Extract call routes
- [ ] Extract voice webhook routes
- [ ] Extract observability routes
- [ ] Extract WebSocket handler to `websocket/`
- [ ] Reduce `index.js` to <150 lines (setup only)

**Success criteria:** index.js under 150 lines, all endpoints still work

---

### Error Recovery & Circuit Breakers
- id: sec-circuit-breakers
- status: pending
- effort: 2 weeks
- depends_on: none
- files: `adapters/llm/*.js`, `adapters/elevenlabs*.js`

**Risk:** One API timeout cascades into broken call. Silent failures hide problems.

**Retry Logic:**
- [ ] Install `p-retry` or implement exponential backoff
- [ ] Add retries to Claude API calls (2 retries, 1s backoff)
- [ ] Add retries to ElevenLabs TTS (2 retries)
- [ ] Add retries to Deepgram STT connection
- [ ] Add retries to database operations

**Circuit Breakers:**
- [ ] Install `opossum` circuit breaker library
- [ ] Wrap Claude adapter with circuit breaker
- [ ] Wrap ElevenLabs adapter with circuit breaker
- [ ] Define fallback behavior (graceful degradation)
- [ ] Add circuit state to health check

**Success criteria:** Calls don't fail silently; fallbacks activate on provider outage

---

## MEDIUM - Before 500+ Users

### TypeScript Migration
- id: sec-typescript
- status: pending
- effort: 6-8 weeks
- depends_on: sec-routes
- files: All `.js` files

**Risk:** Runtime errors, no IDE support, hard to onboard new developers.

**Migration order:**
1. [ ] `packages/types/` - Create shared types first
2. [ ] `validators/` - Already well-defined schemas
3. [ ] `services/` - Business logic
4. [ ] `adapters/` - External integrations
5. [ ] `pipelines/` - Voice logic
6. [ ] `routes/` - After extraction
7. [ ] `index.ts` - Last

**Setup tasks:**
- [ ] Add `tsconfig.json` to root
- [ ] Configure path aliases
- [ ] Set up incremental migration (allow .js imports)
- [ ] Add `npm run typecheck` script

---

### Structured Logging (Pino)
- id: sec-logging
- status: pending
- effort: 1 week
- depends_on: none
- files: `lib/logger.js`, all files with console.log

**Risk:** Can't filter logs in production. PII in plaintext. No log levels.

**Current state:** 212 `console.log` statements with inconsistent formats.

**Tasks:**
- [ ] Install `pino` and `pino-pretty` (dev)
- [ ] Create `lib/logger.js`
- [ ] Define log levels (debug, info, warn, error)
- [ ] Add PII redaction rules
- [ ] Replace `console.log` statements (212 occurrences)
- [ ] Add request ID to all logs
- [ ] Configure JSON output for production

---

### Observability (OpenTelemetry)
- id: sec-otel
- status: pending
- effort: 2 weeks
- depends_on: none
- files: New instrumentation files

**Risk:** No visibility into production performance. Can't debug latency issues.

**Tasks:**
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

---

### Database Connection Pool
- id: sec-db-pool
- status: pending
- effort: 2 days
- depends_on: none
- files: `db/client.js`

**Risk:** Connection exhaustion under load. No timeout handling.

**Tasks:**
- [ ] Add pool configuration in `db/client.js`
  - max: 20
  - idleTimeoutMillis: 30000
  - connectionTimeoutMillis: 5000
- [ ] Add connection error handling
- [ ] Add pool metrics to health check
- [ ] Test under load

---

### Graceful Shutdown
- id: sec-shutdown
- status: pending
- effort: 1 day
- depends_on: sec-redis
- files: `index.js`

**Risk:** Deploys kill active calls. Memories not extracted from in-progress calls.

**Tasks:**
- [ ] Handle SIGTERM/SIGINT signals
- [ ] Stop accepting new connections
- [ ] Wait for active calls to complete (with timeout)
- [ ] Extract memories from in-progress calls
- [ ] Close database connections
- [ ] Close Redis connections

---

### Enhanced Health Check
- id: sec-health
- status: pending
- effort: 4 hours
- depends_on: sec-redis
- files: `index.js` or `routes/health.js`

**Risk:** Health check says "ok" even when dependencies are down.

**Tasks:**
- [ ] Add database connectivity check
- [ ] Add Redis connectivity check
- [ ] Add external service checks (with caching)
- [ ] Return 503 if critical services down
- [ ] Add uptime and memory usage

---

## LOW - Nice to Have

### API Versioning
- id: sec-api-version
- status: pending
- effort: 2 days
- depends_on: sec-routes

**Tasks:**
- [ ] Add `/api/v1/` prefix to all routes
- [ ] Keep `/api/` as alias for v1 (backwards compat)
- [ ] Document versioning strategy

---

### OpenAPI Documentation
- id: sec-openapi
- status: pending
- effort: 1 week
- depends_on: sec-api-version

**Tasks:**
- [ ] Generate OpenAPI spec from Zod schemas
- [ ] Add Swagger UI at `/api/docs`
- [ ] Keep spec in sync with code

---

### Security Headers
- id: sec-headers
- status: pending
- effort: 2 hours
- depends_on: none

**Tasks:**
- [ ] Add Helmet middleware
- [ ] Configure CSP for admin dashboard
- [ ] Add HSTS headers

---

### Secrets Management
- id: sec-secrets
- status: pending
- effort: 1 day
- depends_on: none

**Tasks:**
- [ ] Move from .env to Railway secrets
- [ ] Rotate API keys
- [ ] Document secret rotation process

---

## Summary

| Priority | Total | Done | Remaining |
|----------|-------|------|-----------|
| CRITICAL | 4     | 4    | 0         |
| HIGH     | 4     | 0    | 4         |
| MEDIUM   | 6     | 0    | 6         |
| LOW      | 4     | 0    | 4         |

**Estimated timeline:** ~6 months for full production hardening

---

*Reference: [PRODUCTION_SECURITY_TODO.md](../PRODUCTION_SECURITY_TODO.md) (original source)*
