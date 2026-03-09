# Scalability Architecture

> How Donna scales to 8,000 daily users with 500 concurrent calls.

---

## Target Capacity

| Metric | Target |
|--------|--------|
| Total users | 8,000 |
| Daily calls | 8,000 (1 per user) |
| Peak concurrent calls | 500 (morning 7-9 AM) |
| Call duration | ~10 minutes average |
| Zero tolerance for dropped calls | Users are elderly, depends on medication reminders |

---

## Admission Control

**File**: `pipecat/main.py` (lines 82-97, 163-176)

### Semaphore-Based Concurrency Limiting

```python
MAX_CALLS = int(os.getenv("MAX_CONCURRENT_CALLS", "50"))
_call_semaphore = asyncio.Semaphore(MAX_CALLS)
```

WebSocket handler flow:
1. Accept WebSocket connection (Twilio protocol requires accept before close)
2. Check `_call_semaphore.locked()` — returns True when all slots taken
3. If at capacity: close with code 1013 (Try Again Later)
4. If available: acquire semaphore, increment `_active_calls` counter
5. On disconnect: release semaphore in `finally` block

### TwiML Fallback

**File**: `pipecat/api/routes/voice.py` (lines 56-66)

Before returning the WebSocket `<Stream>` TwiML, `/voice/answer` checks capacity:

```xml
<!-- Returned when at capacity -->
<Response>
    <Say voice="Polly.Joanna">
        I'm sorry, all lines are busy right now.
        I'll call you back in a few minutes. Goodbye!
    </Say>
    <Hangup/>
</Response>
```

### Monitoring

Health endpoint exposes real-time capacity:

```json
{
  "active_calls": 12,
  "peak_calls": 47,
  "max_calls": 50,
  "pool": { "size": 15, "idle": 8, "max": 50, "min": 5 }
}
```

---

## Database Optimization

### Connection Pool

**File**: `pipecat/db/client.py`

| Setting | Default | Env Var | Purpose |
|---------|---------|---------|---------|
| min_size | 5 | `DB_POOL_MIN` | Warm connections ready |
| max_size | 50 | `DB_POOL_MAX` | Upper bound for concurrent queries |

Pool stats exposed on `/health` endpoint. Slow query logging at 100ms threshold.

### Indexes (11 total)

**File**: `db/migrations/001_add_indexes.sql`

Applied to production Neon database using `CREATE INDEX CONCURRENTLY` (no table locks):

| Index | Table | Impact |
|-------|-------|--------|
| `idx_conversations_call_sid` | conversations | WebSocket message lookup |
| `idx_memories_senior_id` | memories | Memory search (4-8x per call) |
| `idx_conversations_senior_started` | conversations | Context loading at call start |
| `idx_reminders_active_scheduled` | reminders | Scheduler polling (every 60s) |
| `idx_reminders_recurring` | reminders | Recurring reminder queries |
| `idx_deliveries_reminder_scheduled` | reminder_deliveries | Delivery lookups |
| `idx_deliveries_status` | reminder_deliveries | Status-based queries |
| `idx_daily_context_senior_date` | daily_call_context | Daily context per call |
| `idx_analyses_senior_created` | call_analyses | Post-call interest scoring |
| `idx_memories_embedding_hnsw` | memories | **HNSW vector index** — O(log n) semantic search |

The HNSW vector index is the highest-impact single change: turns O(n) full-table scan into O(log n) approximate nearest neighbor search for memory retrieval.

---

## Scheduler Parallelization

**File**: `pipecat/services/scheduler.py`

### Before
Sequential loop with 5-second stagger between Twilio API calls:
- 100 reminders × 5s = 500 seconds (8+ minutes)

### After
Parallel initiation with concurrency limiter:

```python
sem = asyncio.Semaphore(10)  # 10 concurrent Twilio API calls

async def _limited_trigger(item):
    async with sem:
        return await trigger_reminder_call(...)

results = await asyncio.gather(
    *[_limited_trigger(item) for item in due],
    return_exceptions=True,
)
```

- 100 reminders × 10 parallel = ~50 seconds

### Retry with Exponential Backoff
Twilio call initiation retries on both backends:
- **Python** (`tenacity`): 3 attempts, 1s → 2s → 4s delays
- **Node.js** (`retryTwilioCall()`): 3 attempts, 1s → 2s → 4s delays

### Pending Context Cleanup
In-memory Maps (`pendingReminderCalls`, `prefetchedContextByPhone`) have automatic TTL cleanup:
- Entries older than 30 minutes are evicted every 5 minutes
- Prevents unbounded memory growth during sustained operation

---

## Leader Election

**Files**: `pipecat/services/scheduler.py`, `services/scheduler.js`

Both backends use PostgreSQL advisory locks to ensure only one scheduler instance runs:

```python
SCHEDULER_LOCK_ID = 8675309

async def _try_acquire_leader_lock() -> bool:
    row = await query_one(
        "SELECT pg_try_advisory_lock($1) AS acquired",
        SCHEDULER_LOCK_ID,
    )
    return row and row.get("acquired", False)
```

- Lock is session-scoped (released on disconnect)
- Non-blocking: `pg_try_advisory_lock` returns immediately
- Same lock ID used by both Python and Node.js schedulers
- If leader dies, another instance claims leadership on next poll cycle

---

## Redis Shared State (Multi-Instance)

**File**: `pipecat/lib/redis_client.py`

Optional Redis layer for multi-instance deployment. Activated by setting `REDIS_URL` env var.

### Dual Implementation

| Class | Backend | When Used |
|-------|---------|-----------|
| `InMemoryState` | Python dict | Default (single instance) |
| `RedisState` | Redis asyncio | When `REDIS_URL` is set |

Both implement the same async interface:
- `set(key, value, ttl)` / `get(key)` / `delete(key)`
- `set_hash(key, field, value)` / `get_hash(key, field)`
- `keys(pattern)` / `cleanup()`

### What's Stored in Redis
- `call_metadata:{call_sid}` — Call context for WebSocket handler (TTL: 30 min)
- `pending_reminder:{call_sid}` — Reminder context for outbound calls (TTL: 30 min)

### Cross-Instance Flow
1. `/voice/answer` stores call metadata in local dict + Redis
2. `/ws` reads metadata from local dict first, falls back to Redis
3. On call completion, metadata cleaned from both local dict and Redis

---

## Multi-Instance Readiness Checklist

| Requirement | Status | How |
|-------------|--------|-----|
| Shared call metadata | Ready | Redis client module |
| Scheduler deduplication | Ready | PostgreSQL advisory locks |
| Connection pool per instance | Ready | Each instance creates own pool |
| Health monitoring | Ready | Per-instance `/health` endpoint |
| WebSocket affinity | Needed | Twilio routes by call_sid (TBD) |
| Rate limiting | Needed | Redis-backed slowapi (currently in-memory) |
| Context cache sharing | Needed | Redis-backed cache (currently in-memory) |

---

## Production Rollout

**File**: `pipecat/scripts/rollout.sh`

Gradual cohort-based onboarding with health gates:

```
500 users → monitor 5min → pass? →
  1,000 users → monitor 5min → pass? →
    2,000 users → monitor 5min → pass? →
      4,000 users → monitor 5min → pass? →
        8,000 users → complete
```

Each cohort transition:
1. Verify health (`/health` returns `status: ok`, `database: ok`)
2. Enable the next batch of users
3. Monitor for 5 minutes (health check every 30s)
4. Check alerts: capacity >80%, circuit breakers open
5. Abort if 3+ consecutive health failures

### Alert Thresholds

| Metric | Threshold | Action |
|--------|-----------|--------|
| Active calls | >80% of MAX_CONCURRENT_CALLS | Warning: approaching capacity |
| Circuit breakers | Any in "open" state | Warning: external service failure |
| Health failures | 3+ consecutive | Abort rollout |
| DB pool idle | <5 connections | Warning: approaching exhaustion |

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MAX_CONCURRENT_CALLS` | 50 | Semaphore limit for concurrent WebSocket sessions |
| `DB_POOL_MIN` | 5 | Minimum warm database connections |
| `DB_POOL_MAX` | 50 | Maximum database connections |
| `REDIS_URL` | *(empty)* | Optional — enables multi-instance shared state |
| `SCHEDULER_ENABLED` | false | Only one instance should run the scheduler |

---

## Key Files

| File | Purpose |
|------|---------|
| `pipecat/main.py` | Semaphore, health endpoint, graceful shutdown |
| `pipecat/db/client.py` | Connection pool, slow query logging |
| `pipecat/lib/redis_client.py` | Redis/InMemory shared state |
| `pipecat/services/scheduler.py` | Leader election, parallel initiation |
| `pipecat/api/routes/voice.py` | TwiML fallback when at capacity |
| `pipecat/scripts/rollout.sh` | Production rollout script |
| `db/migrations/001_add_indexes.sql` | Database index definitions |
