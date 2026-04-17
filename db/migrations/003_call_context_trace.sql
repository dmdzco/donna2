-- Encrypted per-call LLM context provenance for observability.
-- Apply before deploying context-trace UI/API if possible. The runtime also
-- tolerates this column being absent during a rolling deploy.

ALTER TABLE IF EXISTS call_metrics
  ADD COLUMN IF NOT EXISTS context_trace_encrypted TEXT;

COMMENT ON COLUMN call_metrics.context_trace_encrypted
  IS 'AES-256-GCM encrypted JSON trace of LLM prompt context, memory injections, and tool results for internal observability.';
