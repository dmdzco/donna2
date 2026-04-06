import { Router } from 'express';
import { db } from '../db/client.js';
import { seniors, conversations, memories, reminders, callAnalyses, dailyCallContext, caregivers } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { seniorService } from '../services/seniors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import {
  createSeniorSchema,
  updateSeniorSchema,
  updateScheduleSchema,
  seniorIdParamSchema,
} from '../validators/schemas.js';
import { getAccessibleSeniorIds, canAccessSenior, routeError } from './helpers.js';
import { logAudit, authToRole } from '../services/audit.js';

const router = Router();

// Create a senior profile (admin only)
router.post('/api/seniors', requireAdmin, writeLimiter, validateBody(createSeniorSchema), async (req, res) => {
  try {
    const senior = await seniorService.create(req.body);
    logAudit({
      userId: req.auth.userId,
      userRole: authToRole(req.auth),
      action: 'create',
      resourceType: 'senior',
      resourceId: senior.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json(senior);
  } catch (error) {
    console.error('Failed to create senior:', error);
    const status = error.status || 500;
    const message = status < 500 ? error.message : 'Failed to create senior';
    res.status(status).json({ error: message });
  }
});

// List seniors (admins see all, caregivers see assigned)
router.get('/api/seniors', requireAuth, async (req, res) => {
  try {
    logAudit({
      userId: req.auth.userId,
      userRole: authToRole(req.auth),
      action: 'read',
      resourceType: 'senior',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    const accessibleIds = await getAccessibleSeniorIds(req.auth);
    if (accessibleIds === null) {
      // Admin: return all
      const allSeniors = await seniorService.list();
      return res.json(allSeniors);
    }
    if (accessibleIds.length === 0) {
      return res.json([]);
    }
    // Caregiver: filter by assigned seniors
    const allSeniors = await seniorService.list();
    const filtered = allSeniors.filter(s => accessibleIds.includes(s.id));
    res.json(filtered);
  } catch (error) {
    routeError(res, error, 'GET /api/seniors');
  }
});

// Get senior by ID
router.get('/api/seniors/:id', requireAuth, validateParams(seniorIdParamSchema), async (req, res) => {
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    logAudit({
      userId: req.auth.userId,
      userRole: authToRole(req.auth),
      action: 'read',
      resourceType: 'senior',
      resourceId: req.params.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    const senior = await seniorService.getById(req.params.id);
    if (!senior) {
      return res.status(404).json({ error: 'Senior not found' });
    }
    res.json(senior);
  } catch (error) {
    routeError(res, error, 'GET /api/seniors/:id');
  }
});

// Update senior
router.patch('/api/seniors/:id', requireAuth, writeLimiter, validateParams(seniorIdParamSchema), validateBody(updateSeniorSchema), async (req, res) => {
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    logAudit({
      userId: req.auth.userId,
      userRole: authToRole(req.auth),
      action: 'update',
      resourceType: 'senior',
      resourceId: req.params.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { fields: Object.keys(req.body) },
    });
    const senior = await seniorService.update(req.params.id, req.body);
    res.json(senior);
  } catch (error) {
    routeError(res, error, 'PATCH /api/seniors/:id');
  }
});

// Get senior's call schedule
router.get('/api/seniors/:id/schedule', requireAuth, validateParams(seniorIdParamSchema), async (req, res) => {
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    const senior = await seniorService.getById(req.params.id);
    if (!senior) {
      return res.status(404).json({ error: 'Senior not found' });
    }

    const schedule = senior.preferredCallTimes?.schedule || null;

    res.json({
      schedule,
      topicsToAvoid: senior.preferredCallTimes?.topicsToAvoid || [],
    });
  } catch (error) {
    routeError(res, error, 'GET /api/seniors/:id/schedule');
  }
});

// Update senior's call schedule
router.patch('/api/seniors/:id/schedule', requireAuth, writeLimiter, validateParams(seniorIdParamSchema), validateBody(updateScheduleSchema), async (req, res) => {
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    const { schedule, topicsToAvoid } = req.body;
    const senior = await seniorService.getById(req.params.id);

    if (!senior) {
      return res.status(404).json({ error: 'Senior not found' });
    }

    const updatedPreferredCallTimes = {
      ...senior.preferredCallTimes,
      schedule: schedule || senior.preferredCallTimes?.schedule,
      topicsToAvoid: topicsToAvoid || senior.preferredCallTimes?.topicsToAvoid || [],
    };

    const updated = await seniorService.update(req.params.id, {
      preferredCallTimes: updatedPreferredCallTimes,
    });

    res.json({
      schedule: updated.preferredCallTimes?.schedule,
      topicsToAvoid: updated.preferredCallTimes?.topicsToAvoid || [],
    });
  } catch (error) {
    routeError(res, error, 'PATCH /api/seniors/:id/schedule');
  }
});

// Hard-delete a senior and all associated data
router.delete('/api/seniors/:id/data', requireAuth, writeLimiter, validateParams(seniorIdParamSchema), async (req, res) => {
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    const senior = await seniorService.getById(req.params.id);
    if (!senior) {
      return res.status(404).json({ error: 'Senior not found' });
    }

    const deletedBy = req.auth.userId || 'unknown';
    const reason = !req.auth.isAdmin && !req.auth.isCofounder ? 'caregiver_request' : 'admin_request';

    const counts = await seniorService.hardDelete(req.params.id, deletedBy, reason);
    logAudit({
      userId: req.auth.userId,
      userRole: authToRole(req.auth),
      action: 'hard_delete',
      resourceType: 'senior',
      resourceId: req.params.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { reason, deleted_counts: counts },
    });
    res.json({ success: true, deleted_counts: counts });
  } catch (error) {
    console.error('Failed to hard-delete senior:', error);
    res.status(500).json({ error: 'Failed to delete senior data' });
  }
});

// Data export — HIPAA right-to-access (all data for a senior in one JSON bundle)
router.get('/api/seniors/:id/export', requireAuth, validateParams(seniorIdParamSchema), async (req, res) => {
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }

    const seniorId = req.params.id;

    const [
      senior,
      seniorConversations,
      seniorMemories,
      seniorReminders,
      seniorAnalyses,
      seniorDailyContext,
      seniorCaregiverLinks,
    ] = await Promise.all([
      seniorService.getById(seniorId),
      db.select({
        id: conversations.id,
        seniorId: conversations.seniorId,
        callSid: conversations.callSid,
        startedAt: conversations.startedAt,
        endedAt: conversations.endedAt,
        durationSeconds: conversations.durationSeconds,
        status: conversations.status,
        summary: conversations.summary,
        sentiment: conversations.sentiment,
        concerns: conversations.concerns,
        transcript: conversations.transcript,
        callMetrics: conversations.callMetrics,
      }).from(conversations)
        .where(eq(conversations.seniorId, seniorId))
        .orderBy(desc(conversations.startedAt)),
      db.select({
        id: memories.id,
        seniorId: memories.seniorId,
        type: memories.type,
        content: memories.content,
        source: memories.source,
        importance: memories.importance,
        metadata: memories.metadata,
        createdAt: memories.createdAt,
        lastAccessedAt: memories.lastAccessedAt,
      }).from(memories)
        .where(eq(memories.seniorId, seniorId))
        .orderBy(desc(memories.createdAt)),
      db.select().from(reminders)
        .where(eq(reminders.seniorId, seniorId))
        .orderBy(desc(reminders.createdAt)),
      db.select().from(callAnalyses)
        .where(eq(callAnalyses.seniorId, seniorId))
        .orderBy(desc(callAnalyses.createdAt)),
      db.select().from(dailyCallContext)
        .where(eq(dailyCallContext.seniorId, seniorId))
        .orderBy(desc(dailyCallContext.callDate)),
      db.select({
        id: caregivers.id,
        clerkUserId: caregivers.clerkUserId,
        seniorId: caregivers.seniorId,
        role: caregivers.role,
        createdAt: caregivers.createdAt,
      }).from(caregivers)
        .where(eq(caregivers.seniorId, seniorId)),
    ]);

    if (!senior) {
      return res.status(404).json({ error: 'Senior not found' });
    }

    logAudit({
      userId: req.auth.userId,
      userRole: authToRole(req.auth),
      action: 'export',
      resourceType: 'senior',
      resourceId: seniorId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      exportedAt: new Date().toISOString(),
      senior,
      conversations: seniorConversations,
      memories: seniorMemories,
      reminders: seniorReminders,
      callAnalyses: seniorAnalyses,
      dailyContext: seniorDailyContext,
      caregiverLinks: seniorCaregiverLinks,
    });
  } catch (error) {
    console.error('[Export] Data export failed:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

export default router;
