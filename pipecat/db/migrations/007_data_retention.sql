-- Migration: Add data_deletion_logs table for HIPAA-compliant deletion auditing
-- Run against: dev, staging, production Neon branches

-- Audit log for data deletions (hard deletes + retention purges)
CREATE TABLE IF NOT EXISTS data_deletion_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,       -- 'senior', 'prospect'
  entity_id UUID NOT NULL,
  deletion_type VARCHAR(20) NOT NULL,     -- 'hard_delete', 'retention_purge'
  reason VARCHAR(100),                    -- 'user_request', 'caregiver_request', 'retention_policy'
  deleted_by VARCHAR(255),                -- clerk_user_id or 'system' or admin email
  record_counts JSONB,                    -- {conversations: 42, memories: 156, ...}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deletion_logs_entity ON data_deletion_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_deletion_logs_created ON data_deletion_logs(created_at);
