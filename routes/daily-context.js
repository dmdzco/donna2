import { Router } from 'express';
import { db } from '../db/client.js';
import { dailyCallContext, seniors } from '../db/schema.js';
import { eq, and, gte, lt, desc } from 'drizzle-orm';
import { requireAdmin } from '../middleware/auth.js';
import { routeError } from './helpers.js';
import { logAudit, authToRole } from '../services/audit.js';

const router = Router();

// Get daily context entries, optionally filtered by senior and date
router.get('/api/daily-context', requireAdmin, async (req, res) => {
  try {
    const { seniorId, date } = req.query;

    const conditions = [];
    if (seniorId) {
      conditions.push(eq(dailyCallContext.seniorId, seniorId));
    }
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      conditions.push(gte(dailyCallContext.callDate, start));
      conditions.push(lt(dailyCallContext.callDate, end));
    }

    const query = db.select({
      id: dailyCallContext.id,
      seniorId: dailyCallContext.seniorId,
      seniorName: seniors.name,
      callDate: dailyCallContext.callDate,
      callSid: dailyCallContext.callSid,
      topicsDiscussed: dailyCallContext.topicsDiscussed,
      remindersDelivered: dailyCallContext.remindersDelivered,
      adviceGiven: dailyCallContext.adviceGiven,
      keyMoments: dailyCallContext.keyMoments,
      summary: dailyCallContext.summary,
      createdAt: dailyCallContext.createdAt,
    })
    .from(dailyCallContext)
    .leftJoin(seniors, eq(dailyCallContext.seniorId, seniors.id))
    .orderBy(desc(dailyCallContext.callDate))
    .limit(50);

    const results = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    logAudit({
      userId: req.auth.userId,
      userRole: authToRole(req.auth),
      action: 'read',
      resourceType: 'daily_context',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { seniorId: seniorId || null, date: date || null, count: results.length },
    });

    res.json(results);
  } catch (error) {
    routeError(res, error, 'GET /api/daily-context');
  }
});

export default router;
