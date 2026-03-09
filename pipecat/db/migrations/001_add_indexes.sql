-- Scalability indexes for 8,000 users / 500 concurrent calls
-- Run against Neon DB via psql. CONCURRENTLY prevents table locks.
-- Safe to run on live production DB.

-- Critical path: looked up on every WebSocket message
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_call_sid
  ON conversations(call_sid);

-- Memory search: 4-8x per call, full table scan today
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memories_senior_id
  ON memories(senior_id);

-- Context loading: every call start
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_senior_started
  ON conversations(senior_id, started_at DESC);

-- Scheduler: every 60s polling cycle
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reminders_active_scheduled
  ON reminders(scheduled_time)
  WHERE is_active = true AND is_recurring = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reminders_recurring
  ON reminders(is_recurring)
  WHERE is_active = true;

-- Reminder delivery lookups: N per scheduler cycle
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deliveries_reminder_scheduled
  ON reminder_deliveries(reminder_id, scheduled_for);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deliveries_status
  ON reminder_deliveries(status)
  WHERE status IN ('retry_pending', 'delivered');

-- Daily context: every call
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_context_senior_date
  ON daily_call_context(senior_id, call_date);

-- Call analysis: post-call interest scoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analyses_senior_created
  ON call_analyses(senior_id, created_at DESC);

-- HNSW vector index: turns O(n) memory search into O(log n)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memories_embedding_hnsw
  ON memories USING hnsw(embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
