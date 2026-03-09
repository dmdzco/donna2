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
