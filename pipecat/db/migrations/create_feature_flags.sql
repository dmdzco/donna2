-- Feature flags table for safe rollout of new functionality.
-- Run manually against Neon DB.

CREATE TABLE IF NOT EXISTS feature_flags (
    key TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial flags
INSERT INTO feature_flags (key, enabled, description) VALUES
    ('circuit_breakers', true, 'Enable circuit breaker timeouts on external services'),
    ('enhanced_health', true, 'Include service health details in /health endpoint'),
    ('hnsw_index_search', true, 'Use HNSW index for memory search')
ON CONFLICT (key) DO NOTHING;
