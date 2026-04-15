-- Add encrypted companion columns for remaining PHI/PII fields.
--
-- Transition contract:
--   1. Deploy this migration first.
--   2. Deploy application code that writes encrypted companions and reads
--      encrypted columns first, with plaintext fallback for legacy rows.
--   3. Run scripts/backfill-encrypted-phi.js to encrypt legacy rows.
--   4. After verification, run the same script with --null-plaintext to clear
--      legacy PHI-bearing plaintext columns while preserving operational keys
--      such as phone numbers.

ALTER TABLE IF EXISTS seniors
  ADD COLUMN IF NOT EXISTS call_context_snapshot JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS family_info_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS medical_notes_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS preferred_call_times_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS additional_info_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS call_context_snapshot_encrypted TEXT;

ALTER TABLE IF EXISTS reminders
  ADD COLUMN IF NOT EXISTS title_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS description_encrypted TEXT;

ALTER TABLE IF EXISTS reminder_deliveries
  ADD COLUMN IF NOT EXISTS user_response_encrypted TEXT;

ALTER TABLE IF EXISTS daily_call_context
  ADD COLUMN IF NOT EXISTS context_encrypted TEXT;

ALTER TABLE IF EXISTS notifications
  ADD COLUMN IF NOT EXISTS content_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS metadata_encrypted TEXT;

ALTER TABLE IF EXISTS waitlist
  ADD COLUMN IF NOT EXISTS payload_encrypted TEXT;

ALTER TABLE IF EXISTS prospects
  ADD COLUMN IF NOT EXISTS details_encrypted TEXT;

ALTER TABLE IF EXISTS caregiver_notes
  ADD COLUMN IF NOT EXISTS content_encrypted TEXT;
