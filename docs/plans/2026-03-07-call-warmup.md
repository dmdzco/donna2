# Call Warmup: Faster Inbound Answer Time

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce inbound call answer time from ~9-10s to ~700ms by pre-computing context and removing all blocking external calls from the answer path.

**Architecture:** Four changes: (1) Enable Anthropic prompt caching for mid-call speed, (2) Add `call_context_snapshot` JSONB and `cached_news` TEXT columns to `seniors` table — snapshot rebuilt after each call, news refreshed daily at 5 AM, (3) Remove news web search from call path entirely — read from `cached_news` column, (4) Run remaining dynamic fetches (memory, caregiver notes) in parallel with `asyncio.gather()`.

**Tech Stack:** asyncpg, asyncio.gather, Anthropic prompt caching (Pipecat built-in)

---

### Current inbound flow (sequential, ~9-10s)

```
1. find_by_phone()              ~100ms   DB
2. build_context()              ~500ms   DB (pgvector)
3. get_news_for_senior()        ~6000ms  OpenAI web search (!!!)
4. get_latest_analysis()        ~100ms   DB
5. get_call_settings()          ~100ms   DB (redundant — already on seniors row!)
6. get_pending_notes()          ~100ms   DB
7. get_recent_summaries()       ~100ms   DB
8. get_recent_turns()           ~100ms   DB
9. get_todays_context()         ~100ms   DB
10. create() conversation       ~100ms   DB
                          TOTAL: ~7-8s
```

### New inbound flow (~700ms)

```
1. find_by_phone()              ~100ms   DB (includes snapshot + call_settings + cached_news)
2. asyncio.gather(
     build_context(),           ~500ms   DB (pgvector) ─┐
     get_pending_notes(),       ~50ms    DB             ─┘ parallel
   )                            ~500ms
3. Read from senior row:
   - snapshot → last_call_analysis, recent_summaries, recent_turns, todays_context
   - cached_news → news context (refreshed daily at 5 AM)
   - call_settings → apply defaults in-memory
   All 0ms (already loaded in step 1)
4. create() conversation        ~100ms   DB
                          TOTAL: ~700ms
```

**News is NEVER fetched during a call.** It's pre-cached daily at 5 AM by `context_cache.py:run_daily_prefetch()` and persisted to `seniors.cached_news`. All calls read from DB.

---

## Task 1: Enable Anthropic Prompt Caching

**Files:**
- Modify: `pipecat/bot.py:216-219`

**Step 1: Add `enable_prompt_caching=True`**

In `pipecat/bot.py`, change the LLM instantiation:

```python
# Before (line 216-219):
llm = AnthropicLLMService(
    api_key=os.getenv("ANTHROPIC_API_KEY", ""),
    model="claude-sonnet-4-5-20250929",
)

# After:
llm = AnthropicLLMService(
    api_key=os.getenv("ANTHROPIC_API_KEY", ""),
    model="claude-sonnet-4-5-20250929",
    params=AnthropicLLMService.InputParams(
        enable_prompt_caching=True,
    ),
)
```

**Step 2: Run tests**

Run: `cd pipecat && python -m pytest tests/ -x -q`
Expected: All existing tests pass (this is a config-only change).

**Step 3: Commit**

```bash
git add pipecat/bot.py
git commit -m "perf: enable Anthropic prompt caching for mid-call LLM speed"
```

---

## Task 2: DB Migration — Add `call_context_snapshot` and `cached_news` Columns

**Files:**
- Create: `pipecat/db/migrations/add_call_context_snapshot.sql`

**Step 1: Write migration SQL**

```sql
-- Add pre-computed call context snapshot and cached news to seniors table.
-- Snapshot: rebuilt after each call by post_call.py. Collapses 6 per-call DB queries into 0.
-- Cached news: refreshed daily at 5 AM by context_cache.py. Removes web search from call path.

ALTER TABLE seniors
ADD COLUMN IF NOT EXISTS call_context_snapshot JSONB DEFAULT NULL;

ALTER TABLE seniors
ADD COLUMN IF NOT EXISTS cached_news TEXT DEFAULT NULL;

ALTER TABLE seniors
ADD COLUMN IF NOT EXISTS cached_news_updated_at TIMESTAMP DEFAULT NULL;

COMMENT ON COLUMN seniors.call_context_snapshot IS
'Pre-computed context for next call. Rebuilt by post_call.py after each call. Contains: last_call_analysis, recent_summaries, recent_turns, todays_context, snapshot_updated_at';

COMMENT ON COLUMN seniors.cached_news IS
'Daily news stories pre-fetched at 5 AM local time by context_cache.py. Read during calls instead of live web search.';
```

**Step 2: Run migration on dev**

```bash
psql $DEV_DATABASE_URL -f pipecat/db/migrations/add_call_context_snapshot.sql
```

**Step 3: Commit**

```bash
git add pipecat/db/migrations/add_call_context_snapshot.sql
git commit -m "chore: add call_context_snapshot and cached_news columns to seniors"
```

---

## Task 3: Persist News to DB During Daily Prefetch

**Files:**
- Modify: `pipecat/services/context_cache.py:129-231` (inside `prefetch_and_cache()`)
- Test: `pipecat/tests/test_context_cache.py` (add test for news persistence)

**Step 1: Write the failing test**

Add to existing test file (or create `pipecat/tests/test_news_cache.py`):

```python
"""Tests for daily news caching to DB."""

import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_prefetch_saves_news_to_db():
    """Daily prefetch should persist news to seniors.cached_news column."""
    from services.context_cache import prefetch_and_cache

    mock_senior = {
        "id": "abc-123",
        "name": "David",
        "timezone": "America/New_York",
        "interests": ["gardening", "baseball"],
        "interest_scores": {},
        "call_settings": None,
    }

    with patch("services.context_cache.get_by_id", new_callable=AsyncMock, return_value=mock_senior), \
         patch("services.context_cache.get_recent_summaries", new_callable=AsyncMock, return_value=None), \
         patch("services.context_cache.get_recent_turns", new_callable=AsyncMock, return_value=None), \
         patch("services.context_cache.get_critical", new_callable=AsyncMock, return_value=[]), \
         patch("services.context_cache.get_important", new_callable=AsyncMock, return_value=[]), \
         patch("services.context_cache.get_recent", new_callable=AsyncMock, return_value=[]), \
         patch("services.context_cache.get_news_for_senior", new_callable=AsyncMock, return_value="NEWS: gardening tips") as mock_news, \
         patch("services.context_cache.select_stories_for_call", return_value="NEWS: gardening tips"), \
         patch("services.context_cache.get_greeting", return_value={"greeting": "Hi", "period": "morning", "template_index": 0}), \
         patch("services.context_cache.execute", new_callable=AsyncMock, return_value="UPDATE 1") as mock_exec:
        await prefetch_and_cache("abc-123")

        # Should have called execute to persist news
        mock_exec.assert_called_once()
        sql = mock_exec.call_args[0][0]
        assert "cached_news" in sql
        assert "seniors" in sql
```

**Step 2: Run test to verify it fails**

Run: `cd pipecat && python -m pytest tests/test_news_cache.py -v`
Expected: FAIL — `execute` not imported in `context_cache.py` and not called.

**Step 3: Add news persistence to `prefetch_and_cache()`**

In `pipecat/services/context_cache.py`, add at the top imports:

```python
from db import execute
```

Then after the news fetch block (around line 168, after `news_context = select_stories_for_call(...)`), add:

```python
            # Persist news to DB so calls never need live web search
            if news_context_full:
                try:
                    await execute(
                        "UPDATE seniors SET cached_news = $1, cached_news_updated_at = NOW() WHERE id = $2",
                        news_context_full,
                        senior_id,
                    )
                    logger.info("Persisted cached news for {name}", name=senior.get("name"))
                except Exception as e:
                    logger.error("Failed to persist news for {sid}: {err}", sid=senior_id, err=str(e))
```

Note: we persist `news_context_full` (all 8 stories), not `news_context` (3 selected). This way the call can select different stories each time using `select_stories_for_call()`.

**Step 4: Run tests**

Run: `cd pipecat && python -m pytest tests/test_news_cache.py -v`
Expected: PASS.

**Step 5: Run full tests**

Run: `cd pipecat && python -m pytest tests/ -x -q`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add pipecat/services/context_cache.py pipecat/tests/test_news_cache.py
git commit -m "feat: persist daily news to DB during 5 AM prefetch"
```

---

## Task 4: Build and Save Context Snapshot After Each Call

**Files:**
- Create: `pipecat/services/call_snapshot.py`
- Modify: `pipecat/services/post_call.py` (add step 7)
- Test: `pipecat/tests/test_call_snapshot.py`

**Step 1: Write the failing test**

Create `pipecat/tests/test_call_snapshot.py`:

```python
"""Tests for call context snapshot service."""

import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_build_snapshot_includes_all_fields():
    """Snapshot should contain all required context fields."""
    from services.call_snapshot import build_snapshot

    mock_analysis = {
        "engagement_score": 7,
        "call_quality": {"rapport": "strong"},
        "summary": "Discussed garden and weather.",
    }

    with patch("services.call_snapshot.get_recent_summaries", new_callable=AsyncMock) as mock_summaries, \
         patch("services.call_snapshot.get_recent_turns", new_callable=AsyncMock) as mock_turns, \
         patch("services.call_snapshot.get_todays_context", new_callable=AsyncMock) as mock_today, \
         patch("services.call_snapshot.format_todays_context") as mock_format:
        mock_summaries.return_value = "- Yesterday: Talked about garden"
        mock_turns.return_value = "RECENT CONVERSATIONS:\n  Senior: Hello"
        mock_today.return_value = {"previousCallCount": 1, "topicsDiscussed": ["garden"]}
        mock_format.return_value = "EARLIER TODAY: discussed garden"

        snapshot = await build_snapshot(
            senior_id="abc-123",
            timezone="America/New_York",
            analysis=mock_analysis,
        )

    assert snapshot["last_call_analysis"] == mock_analysis
    assert snapshot["recent_summaries"] == "- Yesterday: Talked about garden"
    assert snapshot["recent_turns"] == "RECENT CONVERSATIONS:\n  Senior: Hello"
    assert snapshot["todays_context"] == "EARLIER TODAY: discussed garden"
    assert "snapshot_updated_at" in snapshot


@pytest.mark.asyncio
async def test_build_snapshot_handles_no_analysis():
    """Snapshot should work when analysis is None."""
    from services.call_snapshot import build_snapshot

    with patch("services.call_snapshot.get_recent_summaries", new_callable=AsyncMock) as mock_s, \
         patch("services.call_snapshot.get_recent_turns", new_callable=AsyncMock) as mock_t, \
         patch("services.call_snapshot.get_todays_context", new_callable=AsyncMock) as mock_tc, \
         patch("services.call_snapshot.format_todays_context") as mock_f:
        mock_s.return_value = None
        mock_t.return_value = None
        mock_tc.return_value = {"previousCallCount": 0}
        mock_f.return_value = None

        snapshot = await build_snapshot("abc-123", "America/New_York", analysis=None)

    assert snapshot["last_call_analysis"] is None
    assert snapshot["recent_summaries"] is None
    assert snapshot["recent_turns"] is None
    assert snapshot["todays_context"] is None


@pytest.mark.asyncio
async def test_save_snapshot_calls_db():
    """save_snapshot should UPDATE seniors table."""
    from services.call_snapshot import save_snapshot

    snapshot = {"last_call_analysis": None, "snapshot_updated_at": "2026-03-07"}

    with patch("services.call_snapshot.execute", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = "UPDATE 1"
        await save_snapshot("abc-123", snapshot)
        mock_exec.assert_called_once()
        sql = mock_exec.call_args[0][0]
        assert "call_context_snapshot" in sql
        assert "seniors" in sql
```

**Step 2: Run test to verify it fails**

Run: `cd pipecat && python -m pytest tests/test_call_snapshot.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.call_snapshot'`

**Step 3: Write the service**

Create `pipecat/services/call_snapshot.py`:

```python
"""Senior call context snapshot — pre-computed after each call.

Collapses 6 per-call DB queries (summaries, turns, daily context,
analysis) into a single JSONB column on the seniors table, read
for free with find_by_phone().
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from loguru import logger
from db import execute
from services.conversations import get_recent_summaries, get_recent_turns
from services.daily_context import get_todays_context, format_todays_context


async def build_snapshot(
    senior_id: str,
    timezone_name: str = "America/New_York",
    analysis: dict | None = None,
) -> dict:
    """Build the context snapshot from current DB state.

    Called after post-call processing completes, so all data
    (analysis, daily context, summaries) is already written.
    """
    recent_summaries = await get_recent_summaries(senior_id, 3)
    recent_turns = await get_recent_turns(senior_id)
    raw_today = await get_todays_context(senior_id, timezone_name)
    todays_context = format_todays_context(raw_today)

    return {
        "last_call_analysis": analysis,
        "recent_summaries": recent_summaries,
        "recent_turns": recent_turns,
        "todays_context": todays_context,
        "snapshot_updated_at": datetime.now(timezone.utc).isoformat(),
    }


async def save_snapshot(senior_id: str, snapshot: dict) -> None:
    """Persist snapshot to seniors.call_context_snapshot."""
    try:
        await execute(
            "UPDATE seniors SET call_context_snapshot = $1 WHERE id = $2",
            json.dumps(snapshot),
            senior_id,
        )
        logger.info("Saved call snapshot for senior {sid}", sid=str(senior_id)[:8])
    except Exception as e:
        logger.error("Failed to save call snapshot: {err}", err=str(e))
```

**Step 4: Run tests**

Run: `cd pipecat && python -m pytest tests/test_call_snapshot.py -v`
Expected: All 3 tests PASS.

**Step 5: Wire into post_call.py**

Add step 7 at the end of `run_post_call()` in `pipecat/services/post_call.py`, right before the final log line:

```python
    # 7. Rebuild call context snapshot for next call
    try:
        if senior_id:
            from services.call_snapshot import build_snapshot, save_snapshot
            tz = (senior or {}).get("timezone", "America/New_York")
            snapshot = await build_snapshot(senior_id, tz, analysis)
            await save_snapshot(senior_id, snapshot)
    except Exception as e:
        logger.error("[{cs}] Post-call step 7 (call snapshot) failed: {err}", cs=call_sid, err=str(e))
```

**Step 6: Run full tests**

Run: `cd pipecat && python -m pytest tests/ -x -q`
Expected: All tests pass.

**Step 7: Commit**

```bash
git add pipecat/services/call_snapshot.py pipecat/tests/test_call_snapshot.py pipecat/services/post_call.py
git commit -m "feat: build call context snapshot after each call for faster inbound answer"
```

---

## Task 5: Rewrite Voice Answer — Parallel Fetches + Snapshot + Cached News

**Files:**
- Modify: `pipecat/api/routes/voice.py`
- Test: `pipecat/tests/test_api_routes.py` (update existing)

This is the biggest change. The inbound path in `voice_answer()` gets rewritten.

**Step 1: Rewrite the inbound path (lines 74-147)**

Replace the entire `else:` block (inbound call handling) with:

```python
    else:
        # Inbound — look up senior by phone
        from services.seniors import find_by_phone
        logger.info("[{cs}] Looking up senior by phone: target={tp}, normalized={norm}",
                     cs=call_sid, tp=target_phone, norm=target_phone[-10:] if target_phone else "?")
        senior = await find_by_phone(target_phone)
        logger.info("[{cs}] Senior lookup result: {found}", cs=call_sid,
                     found=senior.get("name") if senior else "NOT FOUND")
        if senior:
            logger.info("[{cs}] Inbound from {name}", cs=call_sid, name=senior.get("name", "?"))

            # --- Parallel fetch: memory + caregiver notes (only dynamic queries) ---
            import asyncio
            from services.memory import build_context
            from services.caregivers import get_pending_notes

            mem_result, notes_result = await asyncio.gather(
                build_context(senior["id"], None, senior),
                get_pending_notes(senior["id"]),
                return_exceptions=True,
            )

            memory_context = mem_result if not isinstance(mem_result, Exception) else None
            if isinstance(mem_result, Exception):
                logger.error("[{cs}] Memory fetch failed: {err}", cs=call_sid, err=mem_result)

            caregiver_notes = notes_result if not isinstance(notes_result, Exception) else []
            if isinstance(notes_result, Exception):
                logger.error("[{cs}] Caregiver notes fetch failed: {err}", cs=call_sid, err=notes_result)

            has_caregiver_notes = bool(caregiver_notes)

            # --- News: read from DB (pre-cached daily at 5 AM, never fetched live) ---
            import json as _json
            raw_cached_news = senior.get("cached_news")
            if raw_cached_news:
                try:
                    from services.news import select_stories_for_call
                    news_context = select_stories_for_call(
                        raw_cached_news,
                        interests=senior.get("interests"),
                        interest_scores=senior.get("interest_scores"),
                        count=3,
                    )
                except Exception:
                    news_context = raw_cached_news  # fallback: use full cached text
            else:
                news_context = None

            # --- Read pre-computed snapshot (came with find_by_phone) ---
            snapshot = senior.get("call_context_snapshot")
            if isinstance(snapshot, str):
                try:
                    snapshot = _json.loads(snapshot)
                except Exception:
                    snapshot = None

            if snapshot:
                last_call_analysis = snapshot.get("last_call_analysis")
                previous_calls_summary = snapshot.get("recent_summaries")
                recent_turns = snapshot.get("recent_turns")
                todays_context = snapshot.get("todays_context")
                logger.info("[{cs}] Using pre-computed snapshot (updated {ts})",
                            cs=call_sid, ts=snapshot.get("snapshot_updated_at", "?"))
            else:
                # No snapshot yet (first call ever for this senior) — fetch individually
                logger.info("[{cs}] No snapshot, fetching context individually", cs=call_sid)
                from services.call_analysis import get_latest_analysis
                from services.conversations import get_recent_summaries, get_recent_turns
                from services.daily_context import get_todays_context, format_todays_context
                last_call_analysis = await get_latest_analysis(senior["id"])
                previous_calls_summary = await get_recent_summaries(senior["id"], 3)
                recent_turns = await get_recent_turns(senior["id"])
                raw_ctx = await get_todays_context(senior["id"], senior.get("timezone", "America/New_York"))
                todays_context = format_todays_context(raw_ctx)

            # --- call_settings from senior row (no extra query needed) ---
            from services.seniors import DEFAULT_CALL_SETTINGS
            raw_settings = senior.get("call_settings") or {}
            if isinstance(raw_settings, str):
                try:
                    raw_settings = _json.loads(raw_settings)
                except Exception:
                    raw_settings = {}
            call_settings = {**DEFAULT_CALL_SETTINGS, **raw_settings}

            # --- Inbound greeting ---
            from services.greetings import get_inbound_greeting
            greeting_result = get_inbound_greeting(
                senior_name=senior.get("name", ""),
                senior_id=senior.get("id"),
            )
            pre_generated_greeting = greeting_result.get("greeting", "")
```

**Step 2: Remove old sequential blocks**

Remove these blocks that are now handled above (they currently run after the inbound `else` for all identified seniors):

- `# 1a. Fetch last call analysis` block (lines 100-107) — now from snapshot
- `# 1a2. Fetch per-senior call settings` block (lines 109-116) — now from senior row
- `# 1a3. Pre-fetch caregiver notes` block (lines 118-127) — now from parallel fetch
- `# 1b. Fetch call summaries...` block (lines 129-147) — now from snapshot

These blocks should only remain for the `reminder_context` and `prefetched` paths (outbound calls), which already handle their own context loading.

**Step 3: Update call_metadata dict**

Make sure the `call_metadata[call_sid]` dict (line 170) uses the new variable names. The keys should stay the same — `news_context`, `last_call_analysis`, `has_caregiver_notes`, `call_settings`, `previous_calls_summary`, `recent_turns`, `todays_context` are all still set, just sourced differently.

**Step 4: Run tests**

Run: `cd pipecat && python -m pytest tests/ -x -q`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add pipecat/api/routes/voice.py
git commit -m "perf: rewrite inbound voice answer — snapshot + parallel + cached news

Inbound call answer time: ~9-10s → ~700ms
- Read context snapshot from senior row (0 extra queries)
- Read cached news from senior row (no live web search)
- Parallel fetch memory + caregiver notes
- Read call_settings from senior row (was redundant query)"
```

---

## Task 6: Integration Test + Deploy

**Step 1: Run full test suite**

```bash
cd pipecat && python -m pytest tests/ -v
```

**Step 2: Run migration on dev DB**

```bash
psql $DEV_DATABASE_URL -f pipecat/db/migrations/add_call_context_snapshot.sql
```

**Step 3: Deploy to dev**

```bash
make deploy-dev-pipecat
```

**Step 4: Trigger news prefetch for dev seniors**

The news won't be cached until the next 5 AM run. To test immediately, trigger a manual prefetch via the existing scheduler endpoint or by calling `prefetch_and_cache(senior_id)` — check that "Persisted cached news" appears in logs.

**Step 5: Test with real calls**

1. Call the dev number (+19789235477)
2. Check logs: `make logs-dev`
3. First call: no snapshot → falls back to individual queries (but news comes from `cached_news` column)
4. After call ends, check for "Saved call snapshot for senior" in logs
5. Second call: should see "Using pre-computed snapshot" — answer time should be ~700ms
6. Verify news appears in conversation without any web search log lines

**Step 6: Run migration + deploy to production**

```bash
psql $PROD_DATABASE_URL -f pipecat/db/migrations/add_call_context_snapshot.sql
make deploy-prod
```

**Step 7: Commit docs update**

Update CLAUDE.md and DIRECTORY.md to reflect:
- `call_snapshot.py` service
- `cached_news` column on seniors
- Prompt caching enabled
- New inbound flow diagram
