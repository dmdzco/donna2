-- Donna Scalability: Database Indexes
-- Run directly against Neon via psql. All use CONCURRENTLY (no table locks).
--
-- Usage:
--   psql $DATABASE_URL -f db/migrations/001_add_indexes.sql
--
-- Safe to run on production — CONCURRENTLY does not block reads or writes.
-- If an index already exists, the statement will error harmlessly; use IF NOT EXISTS.

-- 1. Conversations lookup by Twilio call SID (every WebSocket frame)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_call_sid
  ON conversations(call_sid);

-- 2. Memory search by senior (4-8x per call)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memories_senior_id
  ON memories(senior_id);

-- 3. Context loading: recent conversations per senior
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_senior_started
  ON conversations(senior_id, started_at DESC);

-- 4. Scheduler: non-recurring reminders due now
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reminders_active_scheduled
  ON reminders(scheduled_time)
  WHERE is_active = true AND is_recurring = false;

-- 5. Scheduler: recurring reminders
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reminders_recurring
  ON reminders(is_recurring)
  WHERE is_active = true;

-- 6. Reminder delivery lookups per scheduler cycle
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deliveries_reminder_scheduled
  ON reminder_deliveries(reminder_id, scheduled_for);

-- 7. Delivery status filter (retry_pending, delivered)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deliveries_status
  ON reminder_deliveries(status)
  WHERE status IN ('retry_pending', 'delivered');

-- 8. Daily context per senior per day
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_context_senior_date
  ON daily_call_context(senior_id, call_date);

-- 9. Call analysis by senior (post-call interest scoring)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analyses_senior_created
  ON call_analyses(senior_id, created_at DESC);

-- 10. pgvector HNSW index for semantic memory search
-- This is the highest-impact single change: O(n) full scan -> O(log n)
-- Requires pgvector extension (already enabled via db/setup-pgvector.js)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memories_embedding_hnsw
  ON memories USING hnsw(embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
