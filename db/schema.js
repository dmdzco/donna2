import { pgTable, uuid, varchar, text, timestamp, boolean, json, integer, vector } from 'drizzle-orm/pg-core';

// Senior profiles
export const seniors = pgTable('seniors', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull().unique(),
  timezone: varchar('timezone', { length: 100 }).default('America/New_York'),
  interests: text('interests').array(),
  familyInfo: json('family_info'),
  medicalNotes: text('medical_notes'),
  preferredCallTimes: json('preferred_call_times'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  // Consumer app fields
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 50 }),
  zipCode: varchar('zip_code', { length: 20 }),
  additionalInfo: text('additional_info'),
});

// Conversations (call history)
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  seniorId: uuid('senior_id').references(() => seniors.id),
  callSid: varchar('call_sid', { length: 100 }),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  durationSeconds: integer('duration_seconds'),
  status: varchar('status', { length: 50 }),
  summary: text('summary'),
  sentiment: varchar('sentiment', { length: 50 }),
  concerns: text('concerns').array(),
  transcript: json('transcript'),
  callMetrics: json('call_metrics'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Memories with vector embeddings for semantic search
export const memories = pgTable('memories', {
  id: uuid('id').defaultRandom().primaryKey(),
  seniorId: uuid('senior_id').references(() => seniors.id),
  type: varchar('type', { length: 50 }).notNull(), // fact, preference, event, concern, relationship
  content: text('content').notNull(),
  source: varchar('source', { length: 255 }), // conversation_id or 'manual'
  importance: integer('importance').default(50), // 0-100
  embedding: vector('embedding', { dimensions: 1536 }), // OpenAI text-embedding-3-small
  metadata: json('metadata'), // additional context
  createdAt: timestamp('created_at').defaultNow(),
  lastAccessedAt: timestamp('last_accessed_at'),
});

// Reminders
export const reminders = pgTable('reminders', {
  id: uuid('id').defaultRandom().primaryKey(),
  seniorId: uuid('senior_id').references(() => seniors.id),
  type: varchar('type', { length: 50 }), // medication, appointment, custom
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  scheduledTime: timestamp('scheduled_time'),
  isRecurring: boolean('is_recurring').default(false),
  cronExpression: varchar('cron_expression', { length: 100 }),
  isActive: boolean('is_active').default(true),
  lastDeliveredAt: timestamp('last_delivered_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Reminder Deliveries - tracks each delivery attempt for acknowledgment
export const reminderDeliveries = pgTable('reminder_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  reminderId: uuid('reminder_id').references(() => reminders.id),
  scheduledFor: timestamp('scheduled_for').notNull(), // The target time this delivery is for
  deliveredAt: timestamp('delivered_at'),             // When call was made
  acknowledgedAt: timestamp('acknowledged_at'),       // When user acknowledged
  userResponse: text('user_response'),                // What user said
  // Status: pending, delivered, acknowledged, confirmed, retry_pending, max_attempts
  status: varchar('status', { length: 50 }).default('pending'),
  attemptCount: integer('attempt_count').default(0),  // Number of delivery attempts
  callSid: varchar('call_sid', { length: 100 }),      // Twilio call ID
  createdAt: timestamp('created_at').defaultNow(),
});

// Caregivers - maps Clerk user IDs to seniors they can access
export const caregivers = pgTable('caregivers', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkUserId: varchar('clerk_user_id', { length: 255 }).notNull(), // Clerk user ID
  seniorId: uuid('senior_id').references(() => seniors.id).notNull(),
  role: varchar('role', { length: 50 }).default('caregiver'), // caregiver, family, admin
  createdAt: timestamp('created_at').defaultNow(),
});

// Call Analyses - post-call analysis results
export const callAnalyses = pgTable('call_analyses', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: varchar('conversation_id', { length: 100 }),   // streamSid or call identifier
  seniorId: uuid('senior_id').references(() => seniors.id),
  summary: text('summary'),                                       // 2-3 sentence summary
  topics: text('topics').array(),                                 // Topics discussed
  engagementScore: integer('engagement_score'),                   // 1-10 scale
  concerns: json('concerns'),                                     // Array of concern objects
  positiveObservations: text('positive_observations').array(),    // Good things noticed
  followUpSuggestions: text('follow_up_suggestions').array(),     // For next call
  callQuality: json('call_quality'),                              // {rapport, goals_achieved, duration_appropriate}
  createdAt: timestamp('created_at').defaultNow(),
});

// Daily call context - tracks what happened in each call for same-day cross-call memory
export const dailyCallContext = pgTable('daily_call_context', {
  id: uuid('id').defaultRandom().primaryKey(),
  seniorId: uuid('senior_id').references(() => seniors.id).notNull(),
  callDate: timestamp('call_date').notNull(),
  callSid: varchar('call_sid', { length: 100 }),
  topicsDiscussed: text('topics_discussed').array(),
  remindersDelivered: text('reminders_delivered').array(),
  adviceGiven: text('advice_given').array(),
  keyMoments: json('key_moments'),
  summary: text('summary'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Notification preferences — per-caregiver notification settings
export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  caregiverId: uuid('caregiver_id').references(() => caregivers.id).notNull().unique(),
  // Event toggles (default all on)
  callCompleted: boolean('call_completed').default(true),
  concernDetected: boolean('concern_detected').default(true),
  reminderMissed: boolean('reminder_missed').default(true),
  weeklySummary: boolean('weekly_summary').default(true),
  // Channel preferences
  smsEnabled: boolean('sms_enabled').default(true),
  emailEnabled: boolean('email_enabled').default(true),
  // Quiet hours (in caregiver's local time)
  quietHoursStart: varchar('quiet_hours_start', { length: 5 }), // "22:00"
  quietHoursEnd: varchar('quiet_hours_end', { length: 5 }),     // "07:00"
  timezone: varchar('timezone', { length: 100 }).default('America/New_York'),
  // Weekly report day (0=Sun, 1=Mon, ..., 6=Sat)
  weeklyReportDay: integer('weekly_report_day').default(1), // Monday
  weeklyReportTime: varchar('weekly_report_time', { length: 5 }).default('09:00'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Notifications — log of all sent notifications
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  caregiverId: uuid('caregiver_id').references(() => caregivers.id).notNull(),
  seniorId: uuid('senior_id').references(() => seniors.id),
  eventType: varchar('event_type', { length: 50 }).notNull(), // call_completed, concern_detected, reminder_missed, weekly_summary
  channel: varchar('channel', { length: 20 }).notNull(),      // sms, email
  content: text('content').notNull(),
  metadata: json('metadata'),    // event-specific data (analysis id, concern details, etc.)
  sentAt: timestamp('sent_at').defaultNow(),
  readAt: timestamp('read_at'),  // for future in-app notification center
});

// Admin users for dashboard authentication
export const adminUsers = pgTable('admin_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  lastLoginAt: timestamp('last_login_at'),
});

