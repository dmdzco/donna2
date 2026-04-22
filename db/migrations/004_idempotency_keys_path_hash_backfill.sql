-- Backfill legacy idempotency storage that used a plaintext path column.
-- Existing rows are short-lived (24h TTL), so rows without path_hash can be dropped
-- safely during migration instead of trying to recompute hashes in SQL.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'idempotency_keys'
  ) THEN
    ALTER TABLE idempotency_keys
      ADD COLUMN IF NOT EXISTS path_hash varchar(64);

    DELETE FROM idempotency_keys
    WHERE path_hash IS NULL;

    ALTER TABLE idempotency_keys
      ALTER COLUMN path_hash SET NOT NULL;

    ALTER TABLE idempotency_keys
      DROP COLUMN IF EXISTS path;
  END IF;
END $$;
