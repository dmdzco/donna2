import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { AppError } from '../middleware/error-handler.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

export const remindersRouter = Router();

remindersRouter.use(authenticate);

const createReminderSchema = z.object({
  seniorId: z.string().uuid(),
  type: z.enum(['medication', 'appointment', 'custom']),
  title: z.string().min(1),
  description: z.string().optional(),
  scheduleCron: z.string().optional(),
  scheduledTime: z.string().optional(),
  isRecurring: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
});

const updateReminderSchema = createReminderSchema.partial().omit({ seniorId: true });

// List reminders for a senior
remindersRouter.get('/senior/:seniorId', async (req: AuthRequest, res, next) => {
  try {
    // Verify senior belongs to caregiver
    const seniorCheck = await db.query(
      'SELECT id FROM seniors WHERE id = $1 AND caregiver_id = $2',
      [req.params.seniorId, req.caregiverId]
    );

    if (seniorCheck.rows.length === 0) {
      throw new AppError(404, 'Senior not found');
    }

    const result = await db.query(
      `SELECT * FROM reminders WHERE senior_id = $1 ORDER BY created_at DESC`,
      [req.params.seniorId]
    );

    res.json({ reminders: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get single reminder
remindersRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const result = await db.query(
      `SELECT r.* FROM reminders r
       JOIN seniors s ON r.senior_id = s.id
       WHERE r.id = $1 AND s.caregiver_id = $2`,
      [req.params.id, req.caregiverId]
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Reminder not found');
    }

    res.json({ reminder: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Create reminder
remindersRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createReminderSchema.parse(req.body);

    // Verify senior belongs to caregiver
    const seniorCheck = await db.query(
      'SELECT id FROM seniors WHERE id = $1 AND caregiver_id = $2',
      [data.seniorId, req.caregiverId]
    );

    if (seniorCheck.rows.length === 0) {
      throw new AppError(404, 'Senior not found');
    }

    const result = await db.query(
      `INSERT INTO reminders (
        senior_id, type, title, description, schedule_cron,
        scheduled_time, is_recurring, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        data.seniorId,
        data.type,
        data.title,
        data.description || null,
        data.scheduleCron || null,
        data.scheduledTime || null,
        data.isRecurring,
        data.metadata || null,
      ]
    );

    res.status(201).json({ reminder: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Update reminder
remindersRouter.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = updateReminderSchema.parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      type: 'type',
      title: 'title',
      description: 'description',
      scheduleCron: 'schedule_cron',
      scheduledTime: 'scheduled_time',
      isRecurring: 'is_recurring',
      metadata: 'metadata',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (key in data) {
        updates.push(`${column} = $${paramIndex}`);
        values.push((data as any)[key]);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      throw new AppError(400, 'No fields to update');
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id, req.caregiverId);

    const result = await db.query(
      `UPDATE reminders r SET ${updates.join(', ')}
       FROM seniors s
       WHERE r.id = $${paramIndex} AND r.senior_id = s.id AND s.caregiver_id = $${paramIndex + 1}
       RETURNING r.*`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Reminder not found');
    }

    res.json({ reminder: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Delete reminder
remindersRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const result = await db.query(
      `DELETE FROM reminders r
       USING seniors s
       WHERE r.id = $1 AND r.senior_id = s.id AND s.caregiver_id = $2
       RETURNING r.id`,
      [req.params.id, req.caregiverId]
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Reminder not found');
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Toggle reminder active state
remindersRouter.patch('/:id/toggle', async (req: AuthRequest, res, next) => {
  try {
    const result = await db.query(
      `UPDATE reminders r SET is_active = NOT is_active, updated_at = NOW()
       FROM seniors s
       WHERE r.id = $1 AND r.senior_id = s.id AND s.caregiver_id = $2
       RETURNING r.*`,
      [req.params.id, req.caregiverId]
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Reminder not found');
    }

    res.json({ reminder: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
