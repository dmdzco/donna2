-- Encrypted per-call LLM context provenance for observability.
-- Stores prompt/context/tool events that can include PHI. Do not store this as plaintext JSONB.

ALTER TABLE IF EXISTS call_metrics
  ADD COLUMN IF NOT EXISTS context_trace_encrypted TEXT;

COMMENT ON COLUMN call_metrics.context_trace_encrypted
  IS 'AES-256-GCM encrypted JSON trace of LLM prompt context, memory injections, and tool results for internal observability.';
