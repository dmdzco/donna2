-- HIPAA audit logging: tracks who accessed what PHI and when.
-- Required for compliance — never DELETE from this table.

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,           -- admin ID, clerk user ID, or 'cofounder'
  user_role TEXT NOT NULL,         -- 'admin', 'caregiver', 'cofounder'
  action TEXT NOT NULL,            -- 'read', 'create', 'update', 'delete', 'auth_failure'
  resource_type TEXT NOT NULL,     -- 'senior', 'conversation', 'memory', 'reminder', 'call_analysis', 'auth'
  resource_id TEXT,                -- UUID of the accessed resource (nullable for list endpoints)
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',    -- extra context (e.g., query params, filters)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
