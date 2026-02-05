import { db } from '../db/client.js';
import { dailyCallContext } from '../db/schema.js';
import { eq, and, gte } from 'drizzle-orm';

export const dailyContextService = {
  // Get start of day in a timezone (returns a Date object representing midnight in that timezone)
  getStartOfDay(timezone = 'America/New_York') {
    const now = new Date();
    // Format the current date in the target timezone to get the local date parts
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;

    // Build an ISO string for midnight in that timezone
    // Use a temporary date to find the UTC offset at that timezone's midnight
    const midnightLocal = new Date(`${year}-${month}-${day}T00:00:00`);

    // Calculate the offset by checking what time it is in the timezone vs UTC
    const utcFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Use a known reference point to get the offset
    const refDate = new Date(`${year}-${month}-${day}T12:00:00Z`);
    const utcParts = utcFormatter.formatToParts(refDate);
    const tzParts = tzFormatter.formatToParts(refDate);

    const getNum = (parts, type) => parseInt(parts.find(p => p.type === type).value, 10);

    const utcHour = getNum(utcParts, 'hour');
    const tzHour = getNum(tzParts, 'hour');
    const utcDay = getNum(utcParts, 'day');
    const tzDay = getNum(tzParts, 'day');

    // Offset in hours (timezone - UTC)
    let offsetHours = tzHour - utcHour;
    if (tzDay > utcDay) offsetHours += 24;
    if (tzDay < utcDay) offsetHours -= 24;

    // Midnight in timezone = midnight UTC minus the offset
    const midnightUTC = new Date(`${year}-${month}-${day}T00:00:00Z`);
    midnightUTC.setHours(midnightUTC.getHours() - offsetHours);

    return midnightUTC;
  },

  // Save context from a completed call
  async saveCallContext(seniorId, callSid, data) {
    try {
      const callDate = this.getStartOfDay(data.timezone);

      const [record] = await db.insert(dailyCallContext).values({
        seniorId,
        callDate,
        callSid,
        topicsDiscussed: data.topicsDiscussed || [],
        remindersDelivered: data.remindersDelivered || [],
        adviceGiven: data.adviceGiven || [],
        keyMoments: data.keyMoments || [],
        summary: data.summary || null,
      }).returning();

      console.log(`[DailyContext] Saved call context for senior ${seniorId}, call ${callSid}`);
      return record;
    } catch (error) {
      // Table might not exist yet on first deploy
      console.error(`[DailyContext] Error saving call context:`, error.message);
      return null;
    }
  },

  // Load all context from today's previous calls for a senior
  async getTodaysContext(seniorId, timezone = 'America/New_York') {
    const emptyContext = {
      topicsDiscussed: [],
      remindersDelivered: [],
      adviceGiven: [],
      keyMoments: [],
      previousCallCount: 0,
      summaries: [],
    };

    try {
      const startOfDay = this.getStartOfDay(timezone);

      const rows = await db.select().from(dailyCallContext)
        .where(and(
          eq(dailyCallContext.seniorId, seniorId),
          gte(dailyCallContext.callDate, startOfDay)
        ))
        .orderBy(dailyCallContext.createdAt);

      if (rows.length === 0) return emptyContext;

      // Aggregate across all calls using Sets for uniqueness
      const topicsSet = new Set();
      const remindersSet = new Set();
      const adviceSet = new Set();
      const allKeyMoments = [];
      const summaries = [];

      for (const row of rows) {
        if (row.topicsDiscussed) {
          row.topicsDiscussed.forEach(t => topicsSet.add(t));
        }
        if (row.remindersDelivered) {
          row.remindersDelivered.forEach(r => remindersSet.add(r));
        }
        if (row.adviceGiven) {
          row.adviceGiven.forEach(a => adviceSet.add(a));
        }
        if (row.keyMoments) {
          const moments = Array.isArray(row.keyMoments) ? row.keyMoments : [row.keyMoments];
          allKeyMoments.push(...moments);
        }
        if (row.summary) {
          summaries.push(row.summary);
        }
      }

      return {
        topicsDiscussed: [...topicsSet],
        remindersDelivered: [...remindersSet],
        adviceGiven: [...adviceSet],
        keyMoments: allKeyMoments,
        previousCallCount: rows.length,
        summaries,
      };
    } catch (error) {
      // Table might not exist yet on first deploy
      console.error(`[DailyContext] Error loading today's context:`, error.message);
      return emptyContext;
    }
  },

  // Check if a specific reminder was already delivered today
  async wasReminderDeliveredToday(seniorId, reminderTitle, timezone = 'America/New_York') {
    const context = await this.getTodaysContext(seniorId, timezone);
    return context.remindersDelivered.some(r =>
      r.toLowerCase().includes(reminderTitle.toLowerCase()) ||
      reminderTitle.toLowerCase().includes(r.toLowerCase())
    );
  },

  // Format today's context as a prompt section for injection into system prompt
  formatTodaysContext(todaysContext) {
    if (!todaysContext || todaysContext.previousCallCount === 0) return null;

    const lines = [`EARLIER TODAY (from ${todaysContext.previousCallCount} previous call${todaysContext.previousCallCount > 1 ? 's' : ''}):`];

    if (todaysContext.topicsDiscussed?.length > 0) {
      lines.push(`- You already discussed: ${todaysContext.topicsDiscussed.join(', ')}`);
    }

    if (todaysContext.remindersDelivered?.length > 0) {
      lines.push(`- Reminders already delivered today: ${todaysContext.remindersDelivered.join(', ')}`);
      lines.push(`  → If a reminder was already given today, ask "Did you get a chance to [do it]?" instead of repeating it`);
    }

    if (todaysContext.adviceGiven?.length > 0) {
      lines.push(`- Advice already given: ${todaysContext.adviceGiven.join(', ')}`);
    }

    if (todaysContext.summaries?.length > 0) {
      lines.push(`- What happened earlier: ${todaysContext.summaries.filter(Boolean).join('; ')}`);
    }

    lines.push(`\nDo NOT repeat reminders or advice from earlier today. Reference them naturally: "This morning I mentioned...", "Earlier I reminded you about..."`);

    return lines.join('\n');
  },
};
