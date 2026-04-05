-- Token revocation table for HIPAA-compliant session management.
-- Stores SHA-256 hashes of revoked JWT tokens (never the tokens themselves).
-- Expired entries are auto-cleaned by a background task.

CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash TEXT PRIMARY KEY,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by TEXT,
  reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);
