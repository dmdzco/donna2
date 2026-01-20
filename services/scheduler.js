import { db } from '../db/client.js';
import { reminders, seniors, reminderDeliveries } from '../db/schema.js';
import { eq, and, lte, isNull, or, sql, ne, lt } from 'drizzle-orm';
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

// Normalize phone to last 10 digits (matches seniors.js)
const normalizePhone = (phone) => phone.replace(/\D/g, '').slice(-10);

export const schedulerService = {
  /**
   * Calculate the "scheduled for" time for a reminder instance.
   * For recurring reminders, this is today's date with the scheduled time.
   * For non-recurring, it's just the scheduled time.
   */
  getScheduledForTime(reminder) {
    if (!reminder.scheduledTime) return null;
    const scheduled = new Date(reminder.scheduledTime);

    if (reminder.isRecurring) {
      // Use today's date with the scheduled time-of-day
      const now = new Date();
      return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        scheduled.getHours(),
        scheduled.getMinutes(),
        0,
        0
      );
    }
    return scheduled;
  },

  /**
   * Find reminders that are due now
   * - scheduledTime is in the past or within next minute
   * - No acknowledged/confirmed delivery for this scheduled instance
   * - Also includes retry_pending deliveries that are ready for retry
   */
  async getDueReminders() {
    const now = new Date();
    const oneMinuteFromNow = new Date(now.getTime() + 60 * 1000);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    // Find non-recurring reminders due now
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
        eq(seniors.isActive, true)
      ));

    // Find recurring reminders where scheduled time-of-day matches now
    const recurring = await db.select({
      reminder: reminders,
      senior: seniors
    })
      .from(reminders)
      .innerJoin(seniors, eq(reminders.seniorId, seniors.id))
      .where(and(
        eq(reminders.isActive, true),
        eq(reminders.isRecurring, true),
        eq(seniors.isActive, true)
      ));

    // Filter recurring to those whose time-of-day matches now (within 5 min window)
    const recurringDue = recurring.filter(r => {
      if (!r.reminder.scheduledTime) return false;
      const scheduled = new Date(r.reminder.scheduledTime);
      const scheduledMinutes = scheduled.getHours() * 60 + scheduled.getMinutes();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      return Math.abs(scheduledMinutes - nowMinutes) <= 5;
    });

    const allCandidates = [...nonRecurring, ...recurringDue];

    // Filter out reminders that already have acknowledged/confirmed delivery for this instance
    const dueReminders = [];
    for (const candidate of allCandidates) {
      const scheduledFor = this.getScheduledForTime(candidate.reminder);
      if (!scheduledFor) continue;

      // Check if there's already an acknowledged/confirmed delivery for this instance
      const existingDelivery = await db.select()
        .from(reminderDeliveries)
        .where(and(
          eq(reminderDeliveries.reminderId, candidate.reminder.id),
          // Match the scheduled_for time within a 10-minute window
          sql`${reminderDeliveries.scheduledFor} BETWEEN ${new Date(scheduledFor.getTime() - 5 * 60 * 1000)} AND ${new Date(scheduledFor.getTime() + 5 * 60 * 1000)}`,
          // Has been acknowledged, confirmed, or hit max attempts
          or(
            eq(reminderDeliveries.status, 'acknowledged'),
            eq(reminderDeliveries.status, 'confirmed'),
            eq(reminderDeliveries.status, 'max_attempts')
          )
        ))
        .limit(1);

      if (existingDelivery.length === 0) {
        // Check if there's a delivered/retry_pending delivery we should skip (first attempt already made)
        const pendingDelivery = await db.select()
          .from(reminderDeliveries)
          .where(and(
            eq(reminderDeliveries.reminderId, candidate.reminder.id),
            sql`${reminderDeliveries.scheduledFor} BETWEEN ${new Date(scheduledFor.getTime() - 5 * 60 * 1000)} AND ${new Date(scheduledFor.getTime() + 5 * 60 * 1000)}`,
            or(
              eq(reminderDeliveries.status, 'delivered'),
              eq(reminderDeliveries.status, 'retry_pending')
            )
          ))
          .limit(1);

        if (pendingDelivery.length === 0) {
          // No delivery yet for this instance - it's due
          dueReminders.push({ ...candidate, scheduledFor });
        }
      }
    }

    // Also find retry_pending deliveries that are ready for retry (>30 min since last attempt)
    const retriesReady = await db.select({
      delivery: reminderDeliveries,
      reminder: reminders,
      senior: seniors
    })
      .from(reminderDeliveries)
      .innerJoin(reminders, eq(reminderDeliveries.reminderId, reminders.id))
      .innerJoin(seniors, eq(reminders.seniorId, seniors.id))
      .where(and(
        eq(reminderDeliveries.status, 'retry_pending'),
        lt(reminderDeliveries.deliveredAt, thirtyMinutesAgo),
        eq(reminders.isActive, true),
        eq(seniors.isActive, true)
      ));

    // Add retries to due reminders with their delivery record
    for (const retry of retriesReady) {
      dueReminders.push({
        reminder: retry.reminder,
        senior: retry.senior,
        scheduledFor: retry.delivery.scheduledFor,
        existingDelivery: retry.delivery // Include the delivery record for update
      });
    }

    return dueReminders;
  },

  /**
   * Trigger an outbound call for a reminder
   * Pre-fetches memory context BEFORE calling Twilio to reduce lag
   * Now also creates/updates delivery records for acknowledgment tracking
   */
  async triggerReminderCall(reminder, senior, baseUrl, scheduledFor = null, existingDelivery = null) {
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

      // Calculate scheduledFor if not provided
      const targetScheduledFor = scheduledFor || this.getScheduledForTime(reminder) || new Date();

      // Create or update delivery record
      let delivery;
      if (existingDelivery) {
        // Retry - update existing delivery
        [delivery] = await db.update(reminderDeliveries)
          .set({
            deliveredAt: new Date(),
            callSid: call.sid,
            attemptCount: existingDelivery.attemptCount + 1,
            status: 'delivered'
          })
          .where(eq(reminderDeliveries.id, existingDelivery.id))
          .returning();
        console.log(`[Scheduler] Updated delivery record (attempt ${delivery.attemptCount}): ${delivery.id}`);
      } else {
        // First attempt - create new delivery record
        [delivery] = await db.insert(reminderDeliveries).values({
          reminderId: reminder.id,
          scheduledFor: targetScheduledFor,
          deliveredAt: new Date(),
          callSid: call.sid,
          status: 'delivered',
          attemptCount: 1
        }).returning();
        console.log(`[Scheduler] Created delivery record: ${delivery.id}`);
      }

      // Store pre-fetched context for this call (ready when /voice/answer is hit)
      pendingReminderCalls.set(call.sid, {
        reminder,
        senior,
        memoryContext,  // PRE-FETCHED
        reminderPrompt, // PRE-FORMATTED
        triggeredAt: new Date(),
        delivery,       // Include delivery record for acknowledgment tracking
        scheduledFor: targetScheduledFor
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

    // Pre-generate greeting with full context
    let preGeneratedGreeting = null;
    if (senior) {
      preGeneratedGreeting = await this.generateGreeting(senior, memoryContext);
    }

    // Normalize phone for consistent lookup
    const normalized = normalizePhone(phoneNumber);
    prefetchedContextByPhone.set(normalized, {
      senior,
      memoryContext,
      preGeneratedGreeting,
      fetchedAt: new Date()
    });

    console.log(`[Scheduler] Pre-fetch complete for ${normalized} (greeting ready: ${!!preGeneratedGreeting})`);
    return { senior, memoryContext, preGeneratedGreeting };
  },

  /**
   * Generate personalized greeting using Claude with full context
   */
  async generateGreeting(senior, memoryContext) {
    const { getAdapter } = await import('../adapters/llm/index.js');
    const firstName = senior.name?.split(' ')[0];

    // Get recent memories for extra context
    let recentMemories = [];
    try {
      recentMemories = await memoryService.getRecent(senior.id, 5);
    } catch (e) {
      console.error('[Scheduler] Memory fetch error:', e.message);
    }

    const greetingPrompt = `You are Donna, calling ${firstName} to check in.

CONTEXT:
- Interests: ${senior.interests?.join(', ') || 'unknown'}
${memoryContext ? `\n${memoryContext}` : ''}
${recentMemories.length > 0 ? `\nRecent memories:\n${recentMemories.map(m => `- ${m.content}`).join('\n')}` : ''}

Generate a warm, personalized greeting (1-2 sentences). Reference something specific from their life - a hobby, recent event, or something you remember about them. End with a question.

RESPOND WITH ONLY THE GREETING TEXT - nothing else.`;

    try {
      const adapter = getAdapter(process.env.VOICE_MODEL || 'claude-sonnet');
      const greeting = await adapter.generate(greetingPrompt, [], { maxTokens: 100, temperature: 0.8 });
      console.log(`[Scheduler] Generated greeting: "${greeting.substring(0, 50)}..."`);
      return greeting.trim();
    } catch (error) {
      console.error('[Scheduler] Greeting generation error:', error.message);
      return `Hello ${firstName}! It's Donna calling to check in. How are you doing today?`;
    }
  },

  /**
   * Get pre-fetched context for a phone number (for manual API calls)
   */
  getPrefetchedContext(phoneNumber) {
    // Normalize phone for consistent lookup
    const normalized = normalizePhone(phoneNumber);
    const context = prefetchedContextByPhone.get(normalized);
    if (context) {
      prefetchedContextByPhone.delete(normalized); // One-time use
    }
    return context;
  },

  /**
   * Mark a reminder as delivered (legacy - updates lastDeliveredAt on reminder)
   */
  async markDelivered(reminderId) {
    await db.update(reminders)
      .set({ lastDeliveredAt: new Date() })
      .where(eq(reminders.id, reminderId));

    console.log(`[Scheduler] Marked reminder ${reminderId} as delivered`);
  },

  /**
   * Mark a reminder delivery as acknowledged or confirmed
   * Called when user says "okay I'll take it" or "I already took it"
   */
  async markReminderAcknowledged(deliveryId, status, userResponse) {
    if (!deliveryId) {
      console.error('[Scheduler] No delivery ID provided for acknowledgment');
      return null;
    }

    const validStatuses = ['acknowledged', 'confirmed'];
    if (!validStatuses.includes(status)) {
      console.error(`[Scheduler] Invalid status: ${status}`);
      return null;
    }

    try {
      const [updated] = await db.update(reminderDeliveries)
        .set({
          status,
          acknowledgedAt: new Date(),
          userResponse
        })
        .where(eq(reminderDeliveries.id, deliveryId))
        .returning();

      console.log(`[Scheduler] Reminder delivery ${deliveryId} marked as ${status}`);
      return updated;
    } catch (error) {
      console.error('[Scheduler] Failed to mark acknowledgment:', error.message);
      return null;
    }
  },

  /**
   * Handle call end without acknowledgment - set up retry or mark as max_attempts
   * Called when a call completes without the user acknowledging the reminder
   */
  async markCallEndedWithoutAcknowledgment(deliveryId) {
    if (!deliveryId) return;

    try {
      // Get current delivery record
      const [delivery] = await db.select()
        .from(reminderDeliveries)
        .where(eq(reminderDeliveries.id, deliveryId))
        .limit(1);

      if (!delivery) {
        console.log(`[Scheduler] Delivery ${deliveryId} not found`);
        return;
      }

      // If already acknowledged/confirmed, don't change
      if (delivery.status === 'acknowledged' || delivery.status === 'confirmed') {
        console.log(`[Scheduler] Delivery ${deliveryId} already ${delivery.status}, skipping`);
        return;
      }

      // Determine new status based on attempt count
      const newStatus = delivery.attemptCount >= 2 ? 'max_attempts' : 'retry_pending';

      await db.update(reminderDeliveries)
        .set({ status: newStatus })
        .where(eq(reminderDeliveries.id, deliveryId));

      console.log(`[Scheduler] Delivery ${deliveryId} marked as ${newStatus} (attempt ${delivery.attemptCount})`);
    } catch (error) {
      console.error('[Scheduler] Failed to update delivery status:', error.message);
    }
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

      for (const { reminder, senior, scheduledFor, existingDelivery } of dueReminders) {
        const call = await schedulerService.triggerReminderCall(
          reminder,
          senior,
          baseUrl,
          scheduledFor,
          existingDelivery
        );
        if (call) {
          // Mark as delivered on the reminders table (legacy field)
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
