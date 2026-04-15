-- Mobile write idempotency support.
-- Response bodies are encrypted by the Node service before storage because
-- mobile writes can return reminders, profile fields, and other PHI-adjacent data.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key varchar(255) PRIMARY KEY,
  user_id varchar(255) NOT NULL,
  method varchar(10) NOT NULL,
  path text NOT NULL,
  body_hash varchar(64) NOT NULL,
  state varchar(20) NOT NULL DEFAULT 'processing',
  status_code integer,
  response_encrypted text,
  request_id text,
  created_at timestamp DEFAULT now(),
  expires_at timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at
  ON idempotency_keys(expires_at);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user_id
  ON idempotency_keys(user_id);

