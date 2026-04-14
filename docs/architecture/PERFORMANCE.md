# Performance Architecture

> Latency budgets, optimization strategies, and resilience patterns for the Donna voice pipeline.

---

## Pipeline Latency Budget

End-to-end voice latency from user speech to Donna's audio response:

```
User speaks → [STT] → [Observer] → [Director] → [LLM] → [TTS] → Audio out
               200ms     0ms         (async)     800ms    300ms
```

| Component | Latency | Type | Notes |
|-----------|---------|------|-------|
| Deepgram STT | ~200-300ms | Streaming | Nova 3, 8kHz mulaw, interim results |
| Quick Observer | 0ms | Blocking | Regex pattern data, inline |
| Conversation Director | Async | Non-blocking | Groq primary, Gemini fallback; speculative results can be injected same-turn |
| Claude Sonnet 4.5 | ~500-1500ms | Streaming | Token-by-token via Pipecat |
| ElevenLabs TTS | ~200-400ms | Streaming | turbo_v2_5, first chunk |
| **Total perceived** | **~1-2s** | | First audio chunk to user |

**Key insight**: The Director runs asynchronously — it doesn't add to the pipeline's critical path. Its analysis from the previous turn is injected before the current LLM call.

---

## Predictive Context Engine

**File**: `pipecat/services/prefetch.py` (250 LOC)

Speculative memory prefetch that starts while the user is still speaking:

### Two-Wave Prefetch

```
User starts speaking
    │
    ├── Wave 1: Interim transcription arrives (~200ms)
    │   └── Raw utterance query → memory search starts
    │
    └── Wave 2: Query Director analysis (~200ms)
        └── Memory query extraction → memory search starts
            │
            ▼
    Cache populated BEFORE user finishes speaking
    │
    ▼
    Director memory injection → cache HIT (~0ms)
```

### Cache Design
- **Jaccard fuzzy matching**: Query "tell me about his garden" matches cached "gardening interests" (similarity > 0.3)
- **TTL**: 30 seconds per entry
- **Max entries**: 10 (LRU eviction)
- **Hit rate**: Reduces repeated memory context lookups from ~200-300ms to ~0ms

### Impact
Without prefetch: each live memory lookup = embedding generation + pgvector query (~200-300ms)
With prefetch: cache hit = dict lookup (~0ms), avoiding repeated embedding API calls per call

---

## Database Performance

### HNSW Vector Index

**File**: `db/migrations/001_add_indexes.sql`

```sql
CREATE INDEX idx_memories_embedding_hnsw
  ON memories USING hnsw(embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

| Metric | Before (Sequential Scan) | After (HNSW) |
|--------|-------------------------|--------------|
| 1K memories | ~50ms | ~5ms |
| 10K memories | ~500ms | ~5ms |
| 100K memories | ~5,000ms | ~8ms |
| Complexity | O(n) | O(log n) |

### B-Tree Indexes (10 total)

Hot path queries optimized with targeted indexes:

| Query Path | Table | Index | Frequency |
|------------|-------|-------|-----------|
| WebSocket message lookup | conversations | call_sid | Every WS message |
| Memory search | memories | senior_id | 4-8x per call |
| Context loading | conversations | senior_id + started_at DESC | Call start |
| Scheduler polling | reminders | scheduled_time WHERE active | Every 60s |
| Daily context | daily_call_context | senior_id + call_date | Call start |

### Slow Query Detection

**File**: `pipecat/db/client.py`

All database operations (`query_one`, `query_many`, `execute`) are wrapped with timing:

```python
_SLOW_QUERY_THRESHOLD_MS = 100

elapsed_ms = (time.monotonic() - t0) * 1000
if elapsed_ms > _SLOW_QUERY_THRESHOLD_MS:
    logger.warning("Slow query ({ms:.0f}ms): {sql}", ms=elapsed_ms, sql=sql[:120])
```

### Connection Pool Monitoring

Pool statistics available on every `/health` response:

```json
{
  "pool": {
    "size": 15,
    "idle": 8,
    "max": 50,
    "min": 5
  }
}
```

Alert thresholds:
- `idle < 5` — approaching pool exhaustion
- `size == max` — all connections in use, new queries will wait

---

## Circuit Breakers

**File**: `pipecat/lib/circuit_breaker.py` (89 LOC)

Prevents cascading failures when external services are slow or unavailable:

```
CLOSED ──(failure_threshold reached)──► OPEN ──(recovery_timeout elapsed)──► HALF_OPEN
  ▲                                       │                                      │
  │                                       │ (returns fallback)                   │
  └──────(success in half_open)───────────┘◄──────(success)──────────────────────┘
                                          │
                                          └──────(failure)──► OPEN (reset timer)
```

### Configured Breakers

| Breaker | Timeout | Failures to Open | Recovery | Fallback |
|---------|---------|-------------------|----------|----------|
| `gemini_director` | 5s | 3 | 60s | Skip Director analysis (call continues without guidance) |
| `openai_embedding` | 10s | 3 | 60s | Skip memory store/search for that turn |

### Health Reporting

Circuit breaker states exposed on `/health`:

```json
{
  "circuit_breakers": {
    "gemini_director": "closed",
    "openai_embedding": "closed"
  }
}
```

### Degraded Operation
When a circuit breaker opens, the call continues in degraded mode:
- **Director open**: No per-turn guidance — Claude responds based on system prompt alone
- **Embedding open**: No memory search/store — call relies on pre-loaded context only
- Both are non-fatal: the user still has a conversation, just with less contextual awareness

---

## Graceful Shutdown

**File**: `pipecat/main.py` (lines 278-299)

Prevents mid-call disconnections during deployment:

```python
@app.on_event("shutdown")
async def shutdown():
    _shutting_down = True

    if _active_tasks:
        # Give active calls 7s to finish (Railway gives 10s)
        done, pending = await asyncio.wait(list(_active_tasks), timeout=7.0)
        if pending:
            for t in pending:
                t.cancel()
            await asyncio.wait(pending, timeout=2.0)

    await close_pool()  # Close DB pool last
```

- Active calls tracked via `_active_tasks` set
- 7-second drain period on SIGTERM
- Railway's grace period is 10 seconds
- DB pool closed only after all calls drained

---

## Context Strategy: Full APPEND

All call phases use `APPEND` context management (no summary truncation):

| Strategy | Behavior | Trade-off |
|----------|----------|-----------|
| **APPEND** (used) | Full conversation history retained | More tokens, better coherence |
| RESET_WITH_SUMMARY | Summarize then clear | Fewer tokens, loses nuance |

For a 10-minute call (~30 turns), APPEND uses ~15K input tokens per LLM call by the end. This is well within Claude's context window and provides superior conversation quality for elderly users who may reference earlier topics.

---

## Call Ending Optimization

### Problem
LLM tool calls for ending calls are unreliable — Claude says goodbye in text but doesn't call transition tools, leading to awkward hanging calls.

### Solution: Programmatic EndFrame

**File**: `pipecat/processors/quick_observer.py`

```
User: "Bye Donna!"
    │
    ├── Quick Observer detects STRONG goodbye pattern
    ├── Sets _goodbye_in_progress flag (suppresses Director)
    ├── Starts 3.5s timer
    │
    ▼ (3.5s later — lets Claude finish speaking)
    │
    EndFrame injected → Pipeline shutdown → TwilioFrameSerializer terminates call
```

- 3.5s delay allows Claude to complete a natural goodbye response
- Bypasses LLM decision-making entirely (100% reliable)
- Director suppressed during goodbye to prevent stale "RE-ENGAGE" guidance

---

## Performance Monitoring

### Liveness Endpoint (`/live`)

Railway deploy health checks use Pipecat's lightweight `/live` endpoint. It
only verifies that the FastAPI process is serving requests and does not touch
Postgres, Redis, LLM providers, or other external dependencies. This keeps
deploys from failing during a short staging cold-start window before the
readiness smoke test can run.

### Readiness Endpoint (`/health`)

`/health` remains the readiness endpoint for CI smoke tests and monitoring. It
verifies database reachability and reports pool, cache, circuit breaker, and
call metrics.

```json
{
  "status": "ok",
  "service": "donna-pipecat",
  "active_calls": 12,
  "peak_calls": 47,
  "max_calls": 50,
  "uptime_seconds": 86400,
  "database": "ok",
  "pool": { "size": 15, "idle": 8, "max": 50, "min": 5 },
  "circuit_breakers": {
    "gemini_director": "closed",
    "openai_embedding": "closed"
  }
}
```

### What to Monitor

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| Active calls | `/health` | >80% of max_calls |
| Pool idle | `/health` pool.idle | <5 |
| Circuit breakers | `/health` circuit_breakers | Any "open" |
| Slow queries | Railway logs | >100ms |
| Call duration | conversations table | Avg >15min (possible hang) |
| Post-call time | Railway logs | >15s (parallelization regression) |

---

## Key Files

| File | Purpose |
|------|---------|
| `pipecat/services/prefetch.py` | Predictive context prefetch engine (250 LOC) |
| `pipecat/lib/circuit_breaker.py` | Circuit breaker pattern (89 LOC) |
| `pipecat/db/client.py` | Pool config, slow query logging (115 LOC) |
| `pipecat/main.py` | Health endpoint, graceful shutdown (300 LOC) |
| `pipecat/processors/quick_observer.py` | Programmatic call ending (386 LOC) |
| `db/migrations/001_add_indexes.sql` | HNSW + B-tree indexes |
