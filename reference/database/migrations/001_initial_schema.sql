-- Caregivers (users who manage seniors)
CREATE TABLE caregivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seniors (elderly individuals being cared for)
CREATE TABLE seniors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id UUID REFERENCES caregivers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  date_of_birth DATE,
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  location_city VARCHAR(100),
  location_state VARCHAR(100),
  interests TEXT[],
  family_info JSONB,
  medical_notes TEXT,
  preferred_call_times JSONB,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Reminders
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  senior_id UUID REFERENCES seniors(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  schedule_cron VARCHAR(100),
  scheduled_time TIMESTAMP,
  is_recurring BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  last_delivered_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Conversations (phone calls)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  senior_id UUID REFERENCES seniors(id) ON DELETE CASCADE,
  call_sid VARCHAR(100),
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  status VARCHAR(50),
  initiated_by VARCHAR(50),
  audio_url TEXT,
  summary TEXT,
  sentiment VARCHAR(50),
  concerns TEXT[],
  reminders_delivered UUID[],
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Conversation turns (individual messages)
CREATE TABLE conversation_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  speaker VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  audio_segment_url TEXT,
  timestamp_offset_ms INTEGER,
  observer_signals JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Scheduled calls
CREATE TABLE scheduled_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  senior_id UUID REFERENCES seniors(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  scheduled_time TIMESTAMP NOT NULL,
  reminder_ids UUID[],
  status VARCHAR(50) DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  conversation_id UUID REFERENCES conversations(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_seniors_caregiver ON seniors(caregiver_id);
CREATE INDEX idx_reminders_senior ON reminders(senior_id);
CREATE INDEX idx_reminders_active ON reminders(senior_id) WHERE is_active = true;
CREATE INDEX idx_conversations_senior ON conversations(senior_id);
CREATE INDEX idx_conversations_call_sid ON conversations(call_sid);
CREATE INDEX idx_conversation_turns_conv ON conversation_turns(conversation_id);
CREATE INDEX idx_scheduled_calls_time ON scheduled_calls(scheduled_time) WHERE status = 'pending';
