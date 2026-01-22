/**
 * Zod Validation Schemas
 *
 * Centralized input validation for all API endpoints.
 * Based on database schema in db/schema.js
 */

import { z } from 'zod';

// =============================================================================
// Common Validators
// =============================================================================

// Phone number: E.164 format or 10-digit US number
const phoneSchema = z.string()
  .min(10, 'Phone number must be at least 10 digits')
  .max(20, 'Phone number too long')
  .regex(/^[\d+\-\s()]+$/, 'Phone number contains invalid characters')
  .transform(phone => {
    // Normalize to digits only, keep last 10 for US numbers
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10 ? `+1${digits}` : `+${digits}`;
  });

// UUID validation
const uuidSchema = z.string().uuid('Invalid UUID format');

// Timezone validation (IANA format)
const timezoneSchema = z.string()
  .min(1)
  .max(100)
  .refine(tz => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Invalid timezone');

// Cron expression validation (basic)
const cronSchema = z.string()
  .max(100)
  .regex(
    /^(\*|(\d+|\d+-\d+)(,(\d+|\d+-\d+))*|\*\/\d+)\s+(\*|(\d+|\d+-\d+)(,(\d+|\d+-\d+))*|\*\/\d+)\s+(\*|(\d+|\d+-\d+)(,(\d+|\d+-\d+))*|\*\/\d+)\s+(\*|(\d+|\d+-\d+)(,(\d+|\d+-\d+))*|\*\/\d+)\s+(\*|(\d+|\d+-\d+)(,(\d+|\d+-\d+))*|\*\/\d+)$/,
    'Invalid cron expression format'
  )
  .optional();

// ISO date string
const isoDateSchema = z.string()
  .refine(date => !isNaN(Date.parse(date)), 'Invalid date format')
  .transform(date => new Date(date));

// =============================================================================
// Senior Schemas
// =============================================================================

export const createSeniorSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name too long')
    .trim(),
  phone: phoneSchema,
  timezone: timezoneSchema.default('America/New_York'),
  interests: z.array(z.string().max(100)).max(20).optional(),
  familyInfo: z.record(z.unknown()).optional(),
  medicalNotes: z.string().max(10000).optional(),
  preferredCallTimes: z.record(z.unknown()).optional(),
  isActive: z.boolean().default(true),
});

export const updateSeniorSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  phone: phoneSchema.optional(),
  timezone: timezoneSchema.optional(),
  interests: z.array(z.string().max(100)).max(20).optional(),
  familyInfo: z.record(z.unknown()).optional(),
  medicalNotes: z.string().max(10000).optional(),
  preferredCallTimes: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

// =============================================================================
// Memory Schemas
// =============================================================================

const memoryTypeEnum = z.enum([
  'fact',
  'preference',
  'event',
  'concern',
  'relationship',
  'health',
  'medication',
  'family',
  'interest',
  'routine',
]);

export const createMemorySchema = z.object({
  type: memoryTypeEnum.default('fact'),
  content: z.string()
    .min(1, 'Content is required')
    .max(5000, 'Content too long'),
  importance: z.number()
    .int()
    .min(0, 'Importance must be 0-100')
    .max(100, 'Importance must be 0-100')
    .default(50),
});

// =============================================================================
// Reminder Schemas
// =============================================================================

const reminderTypeEnum = z.enum([
  'medication',
  'appointment',
  'custom',
  'wellness',
  'social',
]);

export const createReminderSchema = z.object({
  seniorId: uuidSchema,
  type: reminderTypeEnum.default('custom'),
  title: z.string()
    .min(1, 'Title is required')
    .max(255, 'Title too long')
    .trim(),
  description: z.string().max(2000).optional(),
  scheduledTime: isoDateSchema.optional(),
  isRecurring: z.boolean().default(false),
  cronExpression: cronSchema,
}).refine(data => {
  // If recurring, must have cron expression
  if (data.isRecurring && !data.cronExpression) {
    return false;
  }
  // If not recurring, must have scheduled time
  if (!data.isRecurring && !data.scheduledTime) {
    return false;
  }
  return true;
}, {
  message: 'Recurring reminders need cronExpression, non-recurring need scheduledTime',
});

export const updateReminderSchema = z.object({
  title: z.string().min(1).max(255).trim().optional(),
  description: z.string().max(2000).optional(),
  scheduledTime: isoDateSchema.optional(),
  isRecurring: z.boolean().optional(),
  cronExpression: cronSchema,
  isActive: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

// =============================================================================
// Call Schemas
// =============================================================================

export const initiateCallSchema = z.object({
  phoneNumber: phoneSchema,
});

// =============================================================================
// Twilio Webhook Schemas (for trusted Twilio requests)
// =============================================================================

const twilioCallStatusEnum = z.enum([
  'queued',
  'ringing',
  'in-progress',
  'completed',
  'busy',
  'failed',
  'no-answer',
  'canceled',
]);

const twilioDirectionEnum = z.enum([
  'inbound',
  'outbound-api',
  'outbound-dial',
]);

export const voiceAnswerSchema = z.object({
  CallSid: z.string().min(1),
  From: z.string().min(1),
  To: z.string().min(1),
  Direction: twilioDirectionEnum,
  AccountSid: z.string().optional(),
  ApiVersion: z.string().optional(),
  CallerName: z.string().optional(),
}).passthrough(); // Allow additional Twilio fields

export const voiceStatusSchema = z.object({
  CallSid: z.string().min(1),
  CallStatus: twilioCallStatusEnum,
  CallDuration: z.string().optional(),
  AccountSid: z.string().optional(),
}).passthrough();

// =============================================================================
// URL Parameter Schemas
// =============================================================================

export const seniorIdParamSchema = z.object({
  id: uuidSchema,
});

export const reminderIdParamSchema = z.object({
  id: uuidSchema,
});

export const callSidParamSchema = z.object({
  callSid: z.string().min(1),
});

// =============================================================================
// Export all schemas
// =============================================================================

export const schemas = {
  // Seniors
  createSenior: createSeniorSchema,
  updateSenior: updateSeniorSchema,

  // Memories
  createMemory: createMemorySchema,

  // Reminders
  createReminder: createReminderSchema,
  updateReminder: updateReminderSchema,

  // Calls
  initiateCall: initiateCallSchema,

  // Twilio webhooks
  voiceAnswer: voiceAnswerSchema,
  voiceStatus: voiceStatusSchema,

  // URL params
  seniorIdParam: seniorIdParamSchema,
  reminderIdParam: reminderIdParamSchema,
  callSidParam: callSidParamSchema,
};

export default schemas;
