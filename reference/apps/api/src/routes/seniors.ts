import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { AppError } from '../middleware/error-handler.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { newsService } from '../services/news-service.js';

export const seniorsRouter = Router();

seniorsRouter.use(authenticate);

const createSeniorSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  dateOfBirth: z.string().optional(),
  timezone: z.string().default('America/New_York'),
  locationCity: z.string().optional(),
  locationState: z.string().optional(),
  interests: z.array(z.string()).default([]),
  familyInfo: z.record(z.any()).optional(),
  medicalNotes: z.string().optional(),
  preferredCallTimes: z.record(z.any()).optional(),
  quietHoursStart: z.string().optional(),
  quietHoursEnd: z.string().optional(),
});

const updateSeniorSchema = createSeniorSchema.partial();

// List all seniors for caregiver
seniorsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, name, phone, date_of_birth, timezone, location_city,
              location_state, interests, is_active, created_at
       FROM seniors
       WHERE caregiver_id = $1
       ORDER BY name`,
      [req.caregiverId]
    );

    res.json({ seniors: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get single senior
seniorsRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM seniors WHERE id = $1 AND caregiver_id = $2`,
      [req.params.id, req.caregiverId]
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Senior not found');
    }

    res.json({ senior: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Create senior
seniorsRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createSeniorSchema.parse(req.body);

    const result = await db.query(
      `INSERT INTO seniors (
        caregiver_id, name, phone, date_of_birth, timezone,
        location_city, location_state, interests, family_info,
        medical_notes, preferred_call_times, quiet_hours_start, quiet_hours_end
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        req.caregiverId,
        data.name,
        data.phone,
        data.dateOfBirth || null,
        data.timezone,
        data.locationCity || null,
        data.locationState || null,
        data.interests,
        data.familyInfo || null,
        data.medicalNotes || null,
        data.preferredCallTimes || null,
        data.quietHoursStart || null,
        data.quietHoursEnd || null,
      ]
    );

    res.status(201).json({ senior: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Update senior
seniorsRouter.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = updateSeniorSchema.parse(req.body);

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      phone: 'phone',
      dateOfBirth: 'date_of_birth',
      timezone: 'timezone',
      locationCity: 'location_city',
      locationState: 'location_state',
      interests: 'interests',
      familyInfo: 'family_info',
      medicalNotes: 'medical_notes',
      preferredCallTimes: 'preferred_call_times',
      quietHoursStart: 'quiet_hours_start',
      quietHoursEnd: 'quiet_hours_end',
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
      `UPDATE seniors SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND caregiver_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Senior not found');
    }

    res.json({ senior: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Delete senior
seniorsRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const result = await db.query(
      `DELETE FROM seniors WHERE id = $1 AND caregiver_id = $2 RETURNING id`,
      [req.params.id, req.caregiverId]
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Senior not found');
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get personalized news for a senior
seniorsRouter.get('/:id/news', async (req: AuthRequest, res, next) => {
  try {
    // Verify senior belongs to caregiver
    const result = await db.query(
      `SELECT id, name, date_of_birth, location_city, location_state, interests
       FROM seniors
       WHERE id = $1 AND caregiver_id = $2`,
      [req.params.id, req.caregiverId]
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Senior not found');
    }

    const senior = result.rows[0];

    // Fetch personalized news
    const newsItems = await newsService.getPersonalizedNews({
      name: senior.name,
      date_of_birth: senior.date_of_birth,
      location_city: senior.location_city,
      location_state: senior.location_state,
      interests: senior.interests || [],
    });

    res.json({ news: newsItems });
  } catch (error) {
    next(error);
  }
});
