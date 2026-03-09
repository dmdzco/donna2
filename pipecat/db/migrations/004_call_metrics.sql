-- Call metrics table for observability dashboards.
-- Stores per-call latency, duration, phase timing, and error data.
-- Written by post_call.py after each completed call.

CREATE TABLE IF NOT EXISTS call_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_sid TEXT NOT NULL,
    senior_id UUID REFERENCES seniors(id),
    call_type TEXT DEFAULT 'check-in',
    duration_seconds INTEGER,
    end_reason TEXT,
    turn_count INTEGER DEFAULT 0,
    phase_durations JSONB,
    latency JSONB,
    breaker_states JSONB,
    tools_used TEXT[],
    token_usage JSONB,
    error_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_metrics_created_at ON call_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_metrics_senior_id ON call_metrics(senior_id);
CREATE INDEX IF NOT EXISTS idx_call_metrics_call_sid ON call_metrics(call_sid);
