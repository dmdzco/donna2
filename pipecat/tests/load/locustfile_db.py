"""Database layer load test.

Simulates concurrent DB queries hitting the same paths as live calls:
- Memory semantic search (search_memories)
- Recent summaries (get_recent_summaries)
- Memory store with dedup
- Due reminders (scheduler queries)

Run:
    cd pipecat
    LOAD_TEST_DB_URL=postgresql://... uv run locust -f tests/load/locustfile_db.py \
        --headless -u 100 -r 10 -t 60s
"""

import asyncio
import json
import os
import random
import threading
import time

from locust import User, task, between, events

# Run asyncio event loop in a dedicated thread (Locust uses gevent)
_loop = asyncio.new_event_loop()
_thread = threading.Thread(target=_loop.run_forever, daemon=True)
_thread.start()


def _run(coro):
    """Submit coroutine to the background asyncio loop and wait for result."""
    future = asyncio.run_coroutine_threadsafe(coro, _loop)
    return future.result(timeout=30)


# Lazy pool init
_pool = None
_pool_lock = threading.Lock()


async def _get_pool():
    global _pool
    if _pool is None:
        import asyncpg
        db_url = os.getenv("LOAD_TEST_DB_URL", os.getenv("DATABASE_URL", ""))
        if not db_url:
            raise RuntimeError("LOAD_TEST_DB_URL or DATABASE_URL required")
        _pool = await asyncpg.create_pool(db_url, min_size=5, max_size=50)
    return _pool


async def _query(sql, *args):
    pool = await _get_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(sql, *args)


class DBUser(User):
    """Simulates a single concurrent senior's DB access pattern."""

    wait_time = between(0.1, 0.5)
    # Pick a random senior_id from a pool of test IDs
    _senior_ids: list[str] = []

    def on_start(self):
        # Fetch some real senior IDs to query against
        if not DBUser._senior_ids:
            try:
                rows = _run(_query("SELECT id FROM seniors WHERE is_active = true LIMIT 100"))
                DBUser._senior_ids = [str(r["id"]) for r in rows]
            except Exception:
                DBUser._senior_ids = ["00000000-0000-0000-0000-000000000000"]
        self.senior_id = random.choice(DBUser._senior_ids)

    @task(4)
    def search_memories(self):
        """Semantic memory search — the heaviest query (uses pgvector)."""
        start = time.time()
        try:
            # Generate a dummy embedding (1536 dims) for search
            dummy_emb = json.dumps([random.gauss(0, 1) for _ in range(1536)])
            _run(_query(
                """SELECT id, type, content, importance,
                          1 - (embedding <=> $1::vector) AS similarity
                   FROM memories
                   WHERE senior_id = $2
                     AND 1 - (embedding <=> $1::vector) > 0.5
                   ORDER BY embedding <=> $1::vector
                   LIMIT 5""",
                dummy_emb, self.senior_id,
            ))
            elapsed = (time.time() - start) * 1000
            events.request.fire(
                request_type="DB", name="search_memories",
                response_time=elapsed, response_length=0, exception=None,
            )
        except Exception as e:
            elapsed = (time.time() - start) * 1000
            events.request.fire(
                request_type="DB", name="search_memories",
                response_time=elapsed, response_length=0, exception=e,
            )

    @task(3)
    def get_recent_summaries(self):
        """Recent call summaries — hit on every call start."""
        start = time.time()
        try:
            _run(_query(
                """SELECT summary, started_at, duration_seconds
                   FROM conversations
                   WHERE senior_id = $1
                     AND status = 'completed'
                     AND summary IS NOT NULL
                   ORDER BY started_at DESC LIMIT 3""",
                self.senior_id,
            ))
            elapsed = (time.time() - start) * 1000
            events.request.fire(
                request_type="DB", name="get_recent_summaries",
                response_time=elapsed, response_length=0, exception=None,
            )
        except Exception as e:
            elapsed = (time.time() - start) * 1000
            events.request.fire(
                request_type="DB", name="get_recent_summaries",
                response_time=elapsed, response_length=0, exception=e,
            )

    @task(2)
    def get_critical_memories(self):
        """Critical memories — tier 1 context."""
        start = time.time()
        try:
            _run(_query(
                """SELECT id, type, content, importance, metadata, created_at
                   FROM memories
                   WHERE senior_id = $1
                     AND (type = 'concern' OR importance >= 80)
                   ORDER BY importance DESC LIMIT 3""",
                self.senior_id,
            ))
            elapsed = (time.time() - start) * 1000
            events.request.fire(
                request_type="DB", name="get_critical_memories",
                response_time=elapsed, response_length=0, exception=None,
            )
        except Exception as e:
            elapsed = (time.time() - start) * 1000
            events.request.fire(
                request_type="DB", name="get_critical_memories",
                response_time=elapsed, response_length=0, exception=e,
            )

    @task(1)
    def get_due_reminders(self):
        """Scheduler query — runs every 60s but tests DB perf."""
        start = time.time()
        try:
            _run(_query(
                """SELECT r.id, r.title, r.scheduled_time, s.name, s.phone
                   FROM reminders r
                   INNER JOIN seniors s ON r.senior_id = s.id
                   WHERE r.is_active = true AND s.is_active = true
                   LIMIT 20""",
            ))
            elapsed = (time.time() - start) * 1000
            events.request.fire(
                request_type="DB", name="get_due_reminders",
                response_time=elapsed, response_length=0, exception=None,
            )
        except Exception as e:
            elapsed = (time.time() - start) * 1000
            events.request.fire(
                request_type="DB", name="get_due_reminders",
                response_time=elapsed, response_length=0, exception=e,
            )
