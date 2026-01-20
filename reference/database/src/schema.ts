import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  time,
  date,
  vector,
} from 'drizzle-orm/pg-core';

// Caregivers table
export const caregivers = pgTable('caregivers', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Seniors table
export const seniors = pgTable('seniors', {
  id: uuid('id').defaultRandom().primaryKey(),
  caregiverId: uuid('caregiver_id').references(() => caregivers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  dateOfBirth: date('date_of_birth'),
  timezone: varchar('timezone', { length: 50 }).notNull().default('America/New_York'),
  locationCity: varchar('location_city', { length: 100 }),
  locationState: varchar('location_state', { length: 100 }),
  interests: text('interests').array(),
  familyInfo: jsonb('family_info'),
  medicalNotes: text('medical_notes'),
  preferredCallTimes: jsonb('preferred_call_times'),
  quietHoursStart: time('quiet_hours_start'),
  quietHoursEnd: time('quiet_hours_end'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Reminders table
export const reminders = pgTable('reminders', {
  id: uuid('id').defaultRandom().primaryKey(),
  seniorId: uuid('senior_id').notNull().references(() => seniors.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  scheduleCron: varchar('schedule_cron', { length: 100 }),
  scheduledTime: timestamp('scheduled_time'),
  isRecurring: boolean('is_recurring').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  lastDeliveredAt: timestamp('last_delivered_at'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Conversations table
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  seniorId: uuid('senior_id').notNull().references(() => seniors.id, { onDelete: 'cascade' }),
  callSid: varchar('call_sid', { length: 100 }),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  durationSeconds: integer('duration_seconds'),
  status: varchar('status', { length: 50 }),
  initiatedBy: varchar('initiated_by', { length: 50 }),
  audioUrl: text('audio_url'),
  summary: text('summary'),
  sentiment: varchar('sentiment', { length: 50 }),
  concerns: text('concerns').array(),
  remindersDelivered: uuid('reminders_delivered').array(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Conversation turns table
export const conversationTurns = pgTable('conversation_turns', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  speaker: varchar('speaker', { length: 50 }).notNull(),
  content: text('content').notNull(),
  audioSegmentUrl: text('audio_segment_url'),
  timestampOffsetMs: integer('timestamp_offset_ms'),
  observerSignals: jsonb('observer_signals'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Scheduled calls table
export const scheduledCalls = pgTable('scheduled_calls', {
  id: uuid('id').defaultRandom().primaryKey(),
  seniorId: uuid('senior_id').notNull().references(() => seniors.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  scheduledTime: timestamp('scheduled_time').notNull(),
  reminderIds: uuid('reminder_ids').array(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Type exports for TypeScript
export type Caregiver = typeof caregivers.$inferSelect;
export type NewCaregiver = typeof caregivers.$inferInsert;

export type Senior = typeof seniors.$inferSelect;
export type NewSenior = typeof seniors.$inferInsert;

export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type ConversationTurn = typeof conversationTurns.$inferSelect;
export type NewConversationTurn = typeof conversationTurns.$inferInsert;

export type ScheduledCall = typeof scheduledCalls.$inferSelect;
export type NewScheduledCall = typeof scheduledCalls.$inferInsert;

// Memories table (Phase 3: Memory & Context Module)
export const memories = pgTable('memories', {
  id: uuid('id').defaultRandom().primaryKey(),
  seniorId: uuid('senior_id').notNull().references(() => seniors.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // 'fact', 'preference', 'event', 'concern'
  content: text('content').notNull(),
  source: varchar('source', { length: 255 }).notNull(), // conversationId or 'manual'
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  importance: integer('importance').notNull().default(50), // 0-100 scale (mapped from 0.0-1.0)
  embedding: vector('embedding', { dimensions: 1536 }), // OpenAI text-embedding-3-small
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;

// Analytics Events table (Phase 3: Analytics Module)
export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: varchar('type', { length: 100 }).notNull(), // event type (call_completed, reminder_delivered, etc.)
  seniorId: uuid('senior_id').references(() => seniors.id, { onDelete: 'cascade' }),
  caregiverId: uuid('caregiver_id').references(() => caregivers.id, { onDelete: 'cascade' }),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  metadata: jsonb('metadata'), // flexible data storage
  createdAt: timestamp('created_at').defaultNow(),
});

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;

// Observability Events table (for call flow, conversation, and observer tracking)
export const observabilityEvents = pgTable('observability_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventType: varchar('event_type', { length: 100 }).notNull(), // call.initiated, turn.transcribed, observer.signal, etc.
  callId: varchar('call_id', { length: 100 }), // Links to conversation.callSid
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  seniorId: uuid('senior_id').references(() => seniors.id, { onDelete: 'cascade' }),
  caregiverId: uuid('caregiver_id').references(() => caregivers.id, { onDelete: 'cascade' }),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  data: jsonb('data').notNull(), // Event-specific payload (observer signals, turn content, etc.)
  metadata: jsonb('metadata'), // Additional context
  createdAt: timestamp('created_at').defaultNow(),
});

export type ObservabilityEvent = typeof observabilityEvents.$inferSelect;
export type NewObservabilityEvent = typeof observabilityEvents.$inferInsert;
