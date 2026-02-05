import { Router } from 'express';
import { db } from '../db/client.js';
import { reminders, seniors } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import {
  createReminderSchema,
  updateReminderSchema,
  reminderIdParamSchema,
} from '../validators/schemas.js';
import { getAccessibleSeniorIds, canAccessSenior } from './helpers.js';

const router = Router();

// List all reminders with senior info (admins see all, caregivers see their seniors')
router.get('/api/reminders', requireAuth, async (req, res) => {
  try {
    const accessibleIds = await getAccessibleSeniorIds(req.auth);
    let query = db.select({
      id: reminders.id,
      seniorId: reminders.seniorId,
      seniorName: seniors.name,
      type: reminders.type,
      title: reminders.title,
      description: reminders.description,
      scheduledTime: reminders.scheduledTime,
      isRecurring: reminders.isRecurring,
      cronExpression: reminders.cronExpression,
      isActive: reminders.isActive,
      lastDeliveredAt: reminders.lastDeliveredAt,
      createdAt: reminders.createdAt,
    })
    .from(reminders)
    .leftJoin(seniors, eq(reminders.seniorId, seniors.id))
    .where(eq(reminders.isActive, true))
    .orderBy(desc(reminders.createdAt));

    const result = await query;
    if (accessibleIds === null) {
      return res.json(result); // Admin sees all
    }
    // Filter for caregiver
    const filtered = result.filter(r => accessibleIds.includes(r.seniorId));
    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a reminder
router.post('/api/reminders', requireAuth, writeLimiter, validateBody(createReminderSchema), async (req, res) => {
  try {
    const { seniorId, type, title, description, scheduledTime, isRecurring, cronExpression } = req.body;
    // Check access to the senior
    if (!await canAccessSenior(req.auth, seniorId)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    const [reminder] = await db.insert(reminders).values({
      seniorId,
      type,
      title,
      description,
      scheduledTime: scheduledTime || null,
      isRecurring,
      cronExpression,
    }).returning();
    res.json(reminder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a reminder
router.patch('/api/reminders/:id', requireAuth, writeLimiter, validateParams(reminderIdParamSchema), validateBody(updateReminderSchema), async (req, res) => {
  try {
    // Get the reminder to check senior access
    const [existing] = await db.select({ seniorId: reminders.seniorId })
      .from(reminders).where(eq(reminders.id, req.params.id));
    if (!existing) {
      return res.status(404).json({ error: 'Reminder not found' });
    }
    if (!await canAccessSenior(req.auth, existing.seniorId)) {
      return res.status(403).json({ error: 'Access denied to this reminder' });
    }

    const { title, description, scheduledTime, isRecurring, cronExpression, isActive } = req.body;
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (scheduledTime !== undefined) updateData.scheduledTime = scheduledTime;
    if (isRecurring !== undefined) updateData.isRecurring = isRecurring;
    if (cronExpression !== undefined) updateData.cronExpression = cronExpression;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [reminder] = await db.update(reminders)
      .set(updateData)
      .where(eq(reminders.id, req.params.id))
      .returning();
    res.json(reminder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a reminder
router.delete('/api/reminders/:id', requireAuth, writeLimiter, validateParams(reminderIdParamSchema), async (req, res) => {
  try {
    // Get the reminder to check senior access
    const [existing] = await db.select({ seniorId: reminders.seniorId })
      .from(reminders).where(eq(reminders.id, req.params.id));
    if (!existing) {
      return res.status(404).json({ error: 'Reminder not found' });
    }
    if (!await canAccessSenior(req.auth, existing.seniorId)) {
      return res.status(403).json({ error: 'Access denied to this reminder' });
    }

    await db.delete(reminders).where(eq(reminders.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
