-- Add encrypted columns for PHI data at rest.
--
-- During the transition period both the original and encrypted columns exist.
-- Application writes to *_encrypted; reads prefer *_encrypted, falling back
-- to the original column for legacy rows.
--
-- Once all rows have been back-filled (via the backfill script), the original
-- columns can be dropped in a follow-up migration.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS transcript_encrypted TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary_encrypted TEXT;
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS analysis_encrypted TEXT;
ALTER TABLE memories       ADD COLUMN IF NOT EXISTS content_encrypted TEXT;

COMMENT ON COLUMN conversations.transcript_encrypted IS 'AES-256-GCM encrypted transcript JSON (enc: prefix). Preferred over transcript JSONB.';
COMMENT ON COLUMN conversations.summary_encrypted    IS 'AES-256-GCM encrypted summary text (enc: prefix). Preferred over summary TEXT.';
COMMENT ON COLUMN call_analyses.analysis_encrypted    IS 'AES-256-GCM encrypted analysis JSON (enc: prefix). Preferred over concerns/call_quality JSONB.';
COMMENT ON COLUMN memories.content_encrypted          IS 'AES-256-GCM encrypted content text (enc: prefix). Preferred over content TEXT.';
