-- Migration 003: Conversation quality & prompt engineering features
-- Run this before deploying the conversation quality update.

-- 1. Caregiver notes table (Phase 7)
CREATE TABLE IF NOT EXISTS caregiver_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    senior_id UUID NOT NULL REFERENCES seniors(id),
    caregiver_id UUID NOT NULL REFERENCES caregivers(id),
    content TEXT NOT NULL,
    note_type TEXT DEFAULT 'message',  -- 'message', 'question', 'alert'
    is_delivered BOOLEAN DEFAULT FALSE,
    delivered_at TIMESTAMP,
    call_sid TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caregiver_notes_senior_pending
    ON caregiver_notes (senior_id) WHERE is_delivered = false;

-- 2. Per-senior call settings (Phase 8)
ALTER TABLE seniors ADD COLUMN IF NOT EXISTS call_settings JSONB DEFAULT '{}';
