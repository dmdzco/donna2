import { db } from '../db/client.js';
import { reminders, seniors } from '../db/schema.js';
import { eq, and, lte, isNull, or, sql } from 'drizzle-orm';
import twilio from 'twilio';
import { memoryService } from './memory.js';

// Initialize Twilio client lazily
let twilioClient = null;
const getTwilioClient = () => {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
};

// Store pre-fetched context for outbound calls (callSid -> { reminder, senior, memoryContext, reminderPrompt })
export const pendingReminderCalls = new Map();

// Store pre-fetched context by phone number (for manual API calls)
export const prefetchedContextByPhone = new Map();

export const schedulerService = {
  /**
   * Find reminders that are due now
   * - scheduledTime is in the past or within next minute
   * - Either never delivered OR recurring and not delivered today
   */
  async getDueReminders() {
    const now = new Date();
    const oneMinuteFromNow = new Date(now.getTime() + 60 * 1000);

    // Find non-recurring reminders due now that haven't been delivered
    const nonRecurring = await db.select({
      reminder: reminders,
      senior: seniors
    })
      .from(reminders)
      .innerJoin(seniors, eq(reminders.seniorId, seniors.id))
      .where(and(
        eq(reminders.isActive, true),
        eq(reminders.isRecurring, false),
        lte(reminders.scheduledTime, oneMinuteFromNow),
        isNull(reminders.lastDeliveredAt),
        eq(seniors.isActive, true)
      ));

    // Find recurring reminders (check if they should fire based on cron)
    // For simplicity, we'll use a basic approach: check if enough time has passed
    const recurring = await db.select({
      reminder: reminders,
      senior: seniors
    })
      .from(reminders)
      .innerJoin(seniors, eq(reminders.seniorId, seniors.id))
      .where(and(
        eq(reminders.isActive, true),
        eq(reminders.isRecurring, true),
        eq(seniors.isActive, true),
        // Haven't been delivered in the last 23 hours (for daily reminders)
        or(
          isNull(reminders.lastDeliveredAt),
          sql`${reminders.lastDeliveredAt} < NOW() - INTERVAL '23 hours'`
        )
      ));

    // For recurring, also check if scheduledTime (time of day) matches current time
    const recurringDue = recurring.filter(r => {
      if (!r.reminder.scheduledTime) return false;
      const scheduled = new Date(r.reminder.scheduledTime);
      const scheduledMinutes = scheduled.getHours() * 60 + scheduled.getMinutes();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      // Within 5 minute window
      return Math.abs(scheduledMinutes - nowMinutes) <= 5;
    });

    return [...nonRecurring, ...recurringDue];
  },

  /**
   * Trigger an outbound call for a reminder
   * Pre-fetches memory context BEFORE calling Twilio to reduce lag
   */
  async triggerReminderCall(reminder, senior, baseUrl) {
    const client = getTwilioClient();
    if (!client) {
      console.error('[Scheduler] Twilio not configured');
      return null;
    }

    try {
      console.log(`[Scheduler] Pre-fetching context for ${senior.name}...`);

      // PRE-FETCH: Build memory context (includes news) BEFORE the call
      const memoryContext = await memoryService.buildContext(senior.id, null, senior);
      const reminderPrompt = this.formatReminderPrompt(reminder);

      console.log(`[Scheduler] Context ready (${memoryContext?.length || 0} chars), triggering call...`);

      const call = await client.calls.create({
        to: senior.phone,
        from: process.env.TWILIO_PHONE_NUMBER,
        url: `${baseUrl}/voice/answer`,
        statusCallback: `${baseUrl}/voice/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      });

      // Store pre-fetched context for this call (ready when /voice/answer is hit)
      pendingReminderCalls.set(call.sid, {
        reminder,
        senior,
        memoryContext,  // PRE-FETCHED
        reminderPrompt, // PRE-FORMATTED
        triggeredAt: new Date()
      });

      console.log(`[Scheduler] Call initiated: ${call.sid}`);
      return call;

    } catch (error) {
      console.error('[Scheduler] Failed to initiate call:', error.message);
      return null;
    }
  },

  /**
   * Pre-fetch context for a manual outbound call (before Twilio connects)
   */
  async prefetchForPhone(phoneNumber, senior) {
    console.log(`[Scheduler] Pre-fetching context for manual call to ${senior?.name || phoneNumber}...`);

    const memoryContext = senior
      ? await memoryService.buildContext(senior.id, null, senior)
      : null;

    prefetchedContextByPhone.set(phoneNumber, {
      senior,
      memoryContext,
      fetchedAt: new Date()
    });

    console.log(`[Scheduler] Pre-fetch complete for ${phoneNumber}`);
    return { senior, memoryContext };
  },

  /**
   * Get pre-fetched context for a phone number (for manual API calls)
   */
  getPrefetchedContext(phoneNumber) {
    const context = prefetchedContextByPhone.get(phoneNumber);
    if (context) {
      prefetchedContextByPhone.delete(phoneNumber); // One-time use
    }
    return context;
  },

  /**
   * Mark a reminder as delivered
   */
  async markDelivered(reminderId) {
    await db.update(reminders)
      .set({ lastDeliveredAt: new Date() })
      .where(eq(reminders.id, reminderId));

    console.log(`[Scheduler] Marked reminder ${reminderId} as delivered`);
  },

  /**
   * Get reminder context for a call (if it was triggered by a reminder)
   */
  getReminderContext(callSid) {
    return pendingReminderCalls.get(callSid);
  },

  /**
   * Clear reminder context after call ends
   */
  clearReminderContext(callSid) {
    pendingReminderCalls.delete(callSid);
  },

  /**
   * Format reminder for injection into system prompt
   */
  formatReminderPrompt(reminder) {
    let prompt = `\n\nIMPORTANT REMINDER TO DELIVER:`;
    prompt += `\nYou are calling to remind them about: "${reminder.title}"`;
    if (reminder.description) {
      prompt += `\nDetails: ${reminder.description}`;
    }
    if (reminder.type === 'medication') {
      prompt += `\nThis is a medication reminder - be gentle but clear about the importance of taking their medication.`;
    } else if (reminder.type === 'appointment') {
      prompt += `\nThis is an appointment reminder - make sure they know the time and any preparation needed.`;
    }
    prompt += `\n\nDeliver this reminder naturally in the conversation - don't sound robotic or alarming.`;
    prompt += `\nStart with a warm greeting, then mention the reminder.`;
    return prompt;
  }
};

/**
 * Start the scheduler polling loop
 */
export function startScheduler(baseUrl, intervalMs = 60000) {
  console.log(`[Scheduler] Starting with ${intervalMs / 1000}s interval`);

  const checkReminders = async () => {
    try {
      const dueReminders = await schedulerService.getDueReminders();

      if (dueReminders.length > 0) {
        console.log(`[Scheduler] Found ${dueReminders.length} due reminder(s)`);
      }

      for (const { reminder, senior } of dueReminders) {
        const call = await schedulerService.triggerReminderCall(reminder, senior, baseUrl);
        if (call) {
          // Mark as delivered immediately (call was initiated)
          await schedulerService.markDelivered(reminder.id);
        }
      }
    } catch (error) {
      console.error('[Scheduler] Error checking reminders:', error.message);
    }
  };

  // Initial check
  checkReminders();

  // Set up interval
  const intervalId = setInterval(checkReminders, intervalMs);

  return intervalId;
}
