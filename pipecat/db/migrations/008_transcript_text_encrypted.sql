-- Add encrypted text transcript storage.
--
-- Structured transcripts remain in conversations.transcript_encrypted.
-- This column stores the same call as readable speaker-labeled text for
-- post-call analysis, export, and later retrieval without adding a new
-- plaintext PHI column.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS transcript_text_encrypted TEXT;

COMMENT ON COLUMN conversations.transcript_text_encrypted IS
  'AES-256-GCM encrypted readable transcript text (enc: prefix). No plaintext companion column.';
