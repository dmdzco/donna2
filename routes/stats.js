import { Router } from 'express';
import { db } from '../db/client.js';
import { reminders, seniors, conversations } from '../db/schema.js';
import { eq, desc, gte, and, sql } from 'drizzle-orm';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// Dashboard statistics (admin only for aggregate stats)
router.get('/api/stats', requireAdmin, async (req, res) => {
  const sessions = req.app.get('sessions');
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Total active seniors
    const [{ count: totalSeniors }] = await db.select({ count: sql`count(*)` })
      .from(seniors)
      .where(eq(seniors.isActive, true));

    // Calls today
    const [{ count: callsToday }] = await db.select({ count: sql`count(*)` })
      .from(conversations)
      .where(gte(conversations.startedAt, startOfDay));

    // Upcoming reminders (next 24 hours)
    const upcomingReminders = await db.select({
      id: reminders.id,
      title: reminders.title,
      type: reminders.type,
      scheduledTime: reminders.scheduledTime,
      seniorName: seniors.name,
    })
    .from(reminders)
    .leftJoin(seniors, eq(reminders.seniorId, seniors.id))
    .where(and(
      eq(reminders.isActive, true),
      gte(reminders.scheduledTime, now),
    ))
    .orderBy(reminders.scheduledTime)
    .limit(10);

    // Recent calls (last 5)
    const recentCalls = await db.select({
      id: conversations.id,
      seniorName: seniors.name,
      startedAt: conversations.startedAt,
      durationSeconds: conversations.durationSeconds,
      status: conversations.status,
    })
    .from(conversations)
    .leftJoin(seniors, eq(conversations.seniorId, seniors.id))
    .orderBy(desc(conversations.startedAt))
    .limit(5);

    res.json({
      totalSeniors: parseInt(totalSeniors) || 0,
      callsToday: parseInt(callsToday) || 0,
      upcomingRemindersCount: upcomingReminders.length,
      activeCalls: sessions.size,
      upcomingReminders,
      recentCalls,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
