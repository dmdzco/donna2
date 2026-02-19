import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { notificationPreferencesSchema, notificationTriggerSchema } from '../validators/schemas.js';
import { notificationService } from '../services/notifications.js';
import { db } from '../db/client.js';
import { caregivers, notifications } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';

const router = Router();

// ---------------------------------------------------------------------------
// Helper: get caregiver ID for the authenticated Clerk user
// ---------------------------------------------------------------------------
async function getCaregiverIdForUser(clerkUserId) {
  const [caregiver] = await db.select({ id: caregivers.id })
    .from(caregivers)
    .where(eq(caregivers.clerkUserId, clerkUserId))
    .limit(1);
  return caregiver?.id || null;
}

// ---------------------------------------------------------------------------
// Helper: validate X-API-Key for service-to-service calls (Pipecat → Node.js)
// ---------------------------------------------------------------------------
function requireServiceApiKey(req, res, next) {
  const apiKey = process.env.DONNA_API_KEY;
  if (!apiKey) {
    // Dev mode — no API key required
    return next();
  }

  const provided = req.headers['x-api-key'];
  if (!provided) {
    return res.status(401).json({ error: 'X-API-Key header required' });
  }

  // Constant-time comparison
  const bufA = Buffer.from(provided);
  const bufB = Buffer.from(apiKey);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
}

// ---------------------------------------------------------------------------
// GET /api/notifications/preferences — get current user's notification prefs
// ---------------------------------------------------------------------------
router.get('/api/notifications/preferences', requireAuth, async (req, res) => {
  try {
    const caregiverId = await getCaregiverIdForUser(req.auth.userId);
    if (!caregiverId) {
      return res.status(404).json({ error: 'Caregiver not found' });
    }

    const prefs = await notificationService.getPreferences(caregiverId);
    res.json(prefs);
  } catch (error) {
    console.error('[Notifications] Get preferences error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/notifications/preferences — update current user's notification prefs
// ---------------------------------------------------------------------------
router.patch('/api/notifications/preferences', requireAuth, async (req, res) => {
  try {
    const parsed = notificationPreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const caregiverId = await getCaregiverIdForUser(req.auth.userId);
    if (!caregiverId) {
      return res.status(404).json({ error: 'Caregiver not found' });
    }

    const updated = await notificationService.upsertPreferences(caregiverId, parsed.data);
    res.json(updated);
  } catch (error) {
    console.error('[Notifications] Update preferences error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/notifications — list notifications for current user (paginated)
// ---------------------------------------------------------------------------
router.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const caregiverId = await getCaregiverIdForUser(req.auth.userId);
    if (!caregiverId) {
      return res.status(404).json({ error: 'Caregiver not found' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    const results = await db.select()
      .from(notifications)
      .where(eq(notifications.caregiverId, caregiverId))
      .orderBy(desc(notifications.sentAt))
      .limit(limit)
      .offset(offset);

    res.json(results);
  } catch (error) {
    console.error('[Notifications] List error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/notifications/:id/read — mark notification as read
// ---------------------------------------------------------------------------
router.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const caregiverId = await getCaregiverIdForUser(req.auth.userId);
    if (!caregiverId) {
      return res.status(404).json({ error: 'Caregiver not found' });
    }

    const [updated] = await db.update(notifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(notifications.id, req.params.id),
        eq(notifications.caregiverId, caregiverId),
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('[Notifications] Mark read error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/notifications/trigger — trigger a notification event
// (service-to-service: Pipecat → Node.js, uses X-API-Key auth)
// ---------------------------------------------------------------------------
router.post('/api/notifications/trigger', requireServiceApiKey, async (req, res) => {
  try {
    const parsed = notificationTriggerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { event_type, senior_id, data } = parsed.data;

    // Dispatch based on event type
    switch (event_type) {
      case 'call_completed':
        await notificationService.onCallCompleted(senior_id, data);
        break;
      case 'concern_detected':
        await notificationService.onConcernDetected(senior_id, data);
        break;
      case 'reminder_missed':
        await notificationService.onReminderMissed(senior_id, data);
        break;
    }

    res.json({ success: true, event_type });
  } catch (error) {
    console.error('[Notifications] Trigger error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
