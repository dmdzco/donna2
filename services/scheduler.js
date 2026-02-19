import { db } from '../db/client.js';
import { reminders, seniors, reminderDeliveries, conversations, notificationPreferences, notifications, caregivers } from '../db/schema.js';
import { eq, and, lte, isNull, or, sql, ne, lt, gte, desc } from 'drizzle-orm';
import twilio from 'twilio';
import { memoryService } from './memory.js';
import { contextCacheService } from './context-cache.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('Scheduler');

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

// Welfare check tracking — prevents calling the same senior twice per day
const welfareCalledToday = new Set();
let lastWelfareClearDate = new Date().toISOString().slice(0, 10);

/**
 * Check if a senior's local time is within the acceptable call window.
 * Default window: 9 AM – 7 PM.
 * If a caregiver explicitly scheduled a reminder in the 5–9 AM range,
 * the early-morning window opens to allow it (earlyAllowed = true).
 */
function isInCallWindow(timezone, { earlyAllowed = false } = {}) {
  try {
    const now = new Date();
    const localHour = parseInt(
      now.toLocaleString('en-US', { timeZone: timezone || 'America/New_York', hour: 'numeric', hour12: false })
    );
    const earliest = earlyAllowed ? 5 : 9;
    return localHour >= earliest && localHour < 19;
  } catch {
    return true; // Default to allowing if timezone is invalid
  }
}

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
   * Merge due reminders and welfare-eligible seniors into a deduplicated call plan.
   * Reminder calls take priority — if a senior has both a reminder and needs welfare,
   * only the reminder fires (it counts as contact).
   * Returns an array of CallSpec objects: { type, senior, reminder?, scheduledFor?, existingDelivery? }
   */
  buildCallPlan(dueReminders, welfareSeniors) {
    const specs = [];
    const seniorIdsWithReminders = new Set();

    // Reminder specs first (higher priority)
    for (const { reminder, senior, scheduledFor, existingDelivery } of dueReminders) {
      specs.push({
        type: 'reminder',
        senior,
        reminder,
        scheduledFor,
        existingDelivery
      });
      seniorIdsWithReminders.add(senior.id);
    }

    // Welfare specs — skip seniors already getting a reminder call or already called today
    for (const senior of welfareSeniors) {
      if (seniorIdsWithReminders.has(senior.id)) continue;
      if (welfareCalledToday.has(senior.id)) continue;

      specs.push({
        type: 'welfare',
        senior
      });
    }

    return specs;
  },

  /**
   * Unified outbound call trigger for both reminder and welfare calls.
   * Gates ALL calls through isInCallWindow(). Handles context prefetch,
   * Twilio call creation, and type-specific bookkeeping.
   */
  async triggerOutboundCall(spec, baseUrl) {
    const { type, senior } = spec;

    // Gate ALL outbound calls through the timezone call window.
    // Reminder calls with an explicit caregiver-set time are allowed as early as 5 AM.
    const earlyAllowed = type === 'reminder' && !!spec.reminder?.scheduledTime;
    if (!isInCallWindow(senior.timezone, { earlyAllowed })) {
      log.info('Outside call window, skipping', { type, name: senior.name, timezone: senior.timezone || 'America/New_York', earlyAllowed });
      return null;
    }

    const client = getTwilioClient();
    if (!client) {
      log.error('Twilio not configured');
      return null;
    }

    try {
      if (type === 'reminder') {
        return await this._triggerReminderPath(spec, baseUrl, client);
      } else {
        return await this._triggerWelfarePath(spec, baseUrl, client);
      }
    } catch (error) {
      log.error('Failed to initiate call', { type, name: senior.name, error: error.message });
      return null;
    }
  },

  /**
   * Reminder call path: build memory context, create Twilio call, create delivery record,
   * store in pendingReminderCalls for /voice/answer pickup.
   */
  async _triggerReminderPath(spec, baseUrl, client) {
    const { senior, reminder, scheduledFor, existingDelivery } = spec;

    log.info('Pre-fetching reminder context', { name: senior.name });

    // PRE-FETCH: Build memory context (includes news) BEFORE the call
    const memoryContext = await memoryService.buildContext(senior.id, null, senior);
    const reminderPrompt = this.formatReminderPrompt(reminder);

    log.info('Context ready, triggering reminder call', { contextLen: memoryContext?.length || 0 });

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
      log.info('Updated delivery record', { deliveryId: delivery.id, attempt: delivery.attemptCount });
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
      log.info('Created delivery record', { deliveryId: delivery.id });
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

    log.info('Reminder call initiated', { callSid: call.sid, name: senior.name });
    return call;
  },

  /**
   * Welfare call path: prefetch context (cache-aware), create Twilio call,
   * store in prefetchedContextByPhone for /voice/answer pickup.
   */
  async _triggerWelfarePath(spec, baseUrl, client) {
    const { senior } = spec;

    log.info('Welfare check: pre-fetching context', { name: senior.name, seniorId: senior.id });

    await this.prefetchForPhone(senior.phone, senior);

    const call = await client.calls.create({
      to: senior.phone,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${baseUrl}/voice/answer`,
      statusCallback: `${baseUrl}/voice/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });

    log.info('Welfare check call initiated', { callSid: call.sid, name: senior.name });
    return call;
  },

  /**
   * Pre-fetch context for a manual outbound call (before Twilio connects)
   * Uses cache if available, otherwise builds fresh context
   */
  async prefetchForPhone(phoneNumber, senior) {
    log.info('Pre-fetching context for manual call', { name: senior?.name, phone: phoneNumber });

    let memoryContext = null;
    let preGeneratedGreeting = null;

    if (senior) {
      // Check cache first
      const cached = contextCacheService.getCache(senior.id);

      if (cached) {
        // Use cached context
        memoryContext = cached.memoryContext;
        preGeneratedGreeting = cached.greeting;
        log.info('Using cached context', { name: senior.name });
      } else {
        // Build fresh context
        memoryContext = await memoryService.buildContext(senior.id, null, senior);
        preGeneratedGreeting = await this.generateGreeting(senior, memoryContext);
      }
    }

    // Normalize phone for consistent lookup
    const normalized = normalizePhone(phoneNumber);
    prefetchedContextByPhone.set(normalized, {
      senior,
      memoryContext,
      preGeneratedGreeting,
      fetchedAt: new Date()
    });

    log.info('Pre-fetch complete', { phone: normalized, greetingReady: !!preGeneratedGreeting });
    return { senior, memoryContext, preGeneratedGreeting };
  },

  /**
   * Generate a template greeting for pre-fetch.
   * Personalized greetings are now handled by Pipecat's greeting service.
   */
  async generateGreeting(senior, memoryContext) {
    const firstName = senior.name?.split(' ')[0];
    return `Hello ${firstName}! It's Donna calling to check in. How are you doing today?`;
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

    log.info('Marked reminder as delivered', { reminderId });
  },

  /**
   * Mark a reminder delivery as acknowledged or confirmed
   * Called when user says "okay I'll take it" or "I already took it"
   */
  async markReminderAcknowledged(deliveryId, status, userResponse) {
    if (!deliveryId) {
      log.error('No delivery ID provided for acknowledgment');
      return null;
    }

    const validStatuses = ['acknowledged', 'confirmed'];
    if (!validStatuses.includes(status)) {
      log.error('Invalid status', { status });
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

      log.info('Reminder delivery marked', { deliveryId, status });
      return updated;
    } catch (error) {
      log.error('Failed to mark acknowledgment', { error: error.message });
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
        log.info('Delivery not found', { deliveryId });
        return;
      }

      // If already acknowledged/confirmed, don't change
      if (delivery.status === 'acknowledged' || delivery.status === 'confirmed') {
        log.info('Delivery already handled, skipping', { deliveryId, status: delivery.status });
        return;
      }

      // Determine new status based on attempt count
      const newStatus = delivery.attemptCount >= 2 ? 'max_attempts' : 'retry_pending';

      await db.update(reminderDeliveries)
        .set({ status: newStatus })
        .where(eq(reminderDeliveries.id, deliveryId));

      log.info('Delivery status updated', { deliveryId, status: newStatus, attempt: delivery.attemptCount });

      // Trigger reminder_missed notification when max attempts reached
      if (newStatus === 'max_attempts') {
        try {
          const [reminder] = await db.select()
            .from(reminders)
            .where(eq(reminders.id, delivery.reminderId))
            .limit(1);
          if (reminder) {
            const { notificationService } = await import('./notifications.js');
            await notificationService.onReminderMissed(reminder.seniorId, {
              reminderTitle: reminder.title,
              reminderType: reminder.type,
              attemptCount: delivery.attemptCount,
            });
          }
        } catch (notifErr) {
          log.error('Failed to send reminder_missed notification', { error: notifErr.message });
        }
      }
    } catch (error) {
      log.error('Failed to update delivery status', { error: error.message });
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
  },

  /**
   * Find active seniors who haven't had a completed conversation in 2+ days.
   * These seniors need a welfare check call.
   */
  async getSeniorsNeedingWelfareCheck() {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const results = await db.execute(sql`
      SELECT s.* FROM seniors s
      WHERE s.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM conversations c
        WHERE c.senior_id = s.id
        AND c.status = 'completed'
        AND c.started_at > ${twoDaysAgo}
      )
    `);
    return results.rows;
  }
};

/**
 * Start the unified scheduler polling loop.
 * Single 60-second loop handles both reminders and welfare checks.
 * Welfare SQL is cheap (NOT EXISTS), so running every minute means
 * newly-eligible seniors get called within ~1 minute instead of ~59.
 */
export function startScheduler(baseUrl, intervalMs = 60000) {
  log.info('Starting unified scheduler', { intervalSeconds: intervalMs / 1000 });

  const runUnifiedCheck = async () => {
    try {
      // Date-rollover clear of welfare tracking
      const today = new Date().toISOString().slice(0, 10);
      if (today !== lastWelfareClearDate) {
        welfareCalledToday.clear();
        lastWelfareClearDate = today;
        log.info('Welfare tracking cleared for new day', { date: today });
      }

      // Fetch both sources in parallel
      const [dueReminders, welfareSeniors] = await Promise.all([
        schedulerService.getDueReminders(),
        schedulerService.getSeniorsNeedingWelfareCheck()
      ]);

      // Merge and deduplicate into a single call plan
      const callPlan = schedulerService.buildCallPlan(dueReminders, welfareSeniors);

      if (callPlan.length > 0) {
        const reminderCount = callPlan.filter(s => s.type === 'reminder').length;
        const welfareCount = callPlan.filter(s => s.type === 'welfare').length;
        log.info('Unified call plan', { total: callPlan.length, reminders: reminderCount, welfare: welfareCount });
      }

      // Execute calls sequentially with 5s stagger
      let executed = 0;
      for (const spec of callPlan) {
        const call = await schedulerService.triggerOutboundCall(spec, baseUrl);
        if (call) {
          // Post-call bookkeeping
          if (spec.type === 'reminder') {
            await schedulerService.markDelivered(spec.reminder.id);
          } else {
            welfareCalledToday.add(spec.senior.id);
          }
          executed++;
          // 5s stagger between calls to avoid overwhelming Twilio
          if (executed < callPlan.length) {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }

      if (executed > 0) {
        log.info('Unified check complete', { executed, planned: callPlan.length });
      }
    } catch (error) {
      log.error('Unified check error', { error: error.message });
      try { const Sentry = await import('@sentry/node'); Sentry.captureException(error); } catch {}
    }
  };

  // Initial check after 5s delay (let server warm up)
  setTimeout(runUnifiedCheck, 5000);

  // Single 60-second polling loop for both reminders and welfare
  const schedulerIntervalId = setInterval(runUnifiedCheck, intervalMs);

  // Hourly context pre-caching (unchanged)
  const prefetchIntervalId = setInterval(async () => {
    try {
      await contextCacheService.runDailyPrefetch();
    } catch (error) {
      log.error('Context pre-fetch error', { error: error.message });
      try { const Sentry = await import('@sentry/node'); Sentry.captureException(error); } catch {}
    }
  }, 60 * 60 * 1000);

  // Run initial pre-fetch check
  contextCacheService.runDailyPrefetch().catch(err => {
    log.error('Initial pre-fetch error', { error: err.message });
    try { import('@sentry/node').then(Sentry => Sentry.captureException(err)); } catch {}
  });

  log.info('Context pre-caching enabled (hourly check for 5 AM local time)');
  log.info('Unified scheduler ready (reminders + welfare every 60s)');

  // Weekly report polling (hourly check)
  const checkWeeklyReports = async () => {
    try {
      // Get all preferences where weekly summary is enabled
      const prefs = await db.select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.weeklySummary, true));

      for (const pref of prefs) {
        const tz = pref.timezone || 'America/New_York';
        const now = new Date();

        // Get current day/time in caregiver's timezone
        const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
        const hourFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });

        const dayStr = dayFormatter.format(now);
        const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        const currentDay = dayMap[dayStr] ?? -1;

        if (currentDay !== pref.weeklyReportDay) continue;

        // Check if current time is within 30min of report time
        const timeParts = hourFormatter.formatToParts(now);
        const currentHour = parseInt(timeParts.find(p => p.type === 'hour').value);
        const currentMinute = parseInt(timeParts.find(p => p.type === 'minute').value);
        const currentMinutes = currentHour * 60 + currentMinute;

        const [reportH, reportM] = (pref.weeklyReportTime || '09:00').split(':').map(Number);
        const reportMinutes = reportH * 60 + reportM;

        if (Math.abs(currentMinutes - reportMinutes) > 30) continue;

        // Check if we already sent a weekly report in the last 6 days for this caregiver
        const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
        const [recentReport] = await db.select({ id: notifications.id })
          .from(notifications)
          .where(and(
            eq(notifications.caregiverId, pref.caregiverId),
            eq(notifications.eventType, 'weekly_summary'),
            gte(notifications.sentAt, sixDaysAgo),
          ))
          .limit(1);

        if (recentReport) continue; // Already sent this week

        // Get the senior for this caregiver
        const [cg] = await db.select({ seniorId: caregivers.seniorId })
          .from(caregivers)
          .where(eq(caregivers.id, pref.caregiverId))
          .limit(1);

        if (!cg) continue;

        log.info('Sending weekly report', { caregiverId: pref.caregiverId, seniorId: cg.seniorId });

        const { notificationService } = await import('./notifications.js');
        await notificationService.sendWeeklyReport(pref.caregiverId, cg.seniorId);
      }
    } catch (error) {
      log.error('Weekly report check error', { error: error.message });
    }
  };

  const weeklyReportIntervalId = setInterval(checkWeeklyReports, 60 * 60 * 1000); // hourly

  // Initial weekly report check (delayed 30s to let server warm up)
  setTimeout(checkWeeklyReports, 30000);

  log.info('Weekly report scheduling enabled (hourly check)');

  return { schedulerIntervalId, prefetchIntervalId, weeklyReportIntervalId };
}
