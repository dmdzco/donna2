import { Router } from 'express';
import { seniorService } from '../services/seniors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import {
  createSeniorSchema,
  updateSeniorSchema,
  seniorIdParamSchema,
} from '../validators/schemas.js';
import { getAccessibleSeniorIds, canAccessSenior } from './helpers.js';

const router = Router();

// Create a senior profile (admin only)
router.post('/api/seniors', requireAdmin, writeLimiter, validateBody(createSeniorSchema), async (req, res) => {
  try {
    const senior = await seniorService.create(req.body);
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
    res.status(500).json({ error: error.message });
  }
});

// Get senior by ID
router.get('/api/seniors/:id', requireAuth, validateParams(seniorIdParamSchema), async (req, res) => {
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    const senior = await seniorService.getById(req.params.id);
    if (!senior) {
      return res.status(404).json({ error: 'Senior not found' });
    }
    res.json(senior);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update senior
router.patch('/api/seniors/:id', requireAuth, writeLimiter, validateParams(seniorIdParamSchema), validateBody(updateSeniorSchema), async (req, res) => {
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    const senior = await seniorService.update(req.params.id, req.body);
    res.json(senior);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get senior's call schedule
router.get('/api/seniors/:id/schedule', requireAuth, validateParams(seniorIdParamSchema), async (req, res) => {
  try {
    const senior = await seniorService.getById(req.params.id);
    if (!senior) {
      return res.status(404).json({ error: 'Senior not found' });
    }

    const schedule = senior.preferredCallTimes?.schedule || null;

    res.json({
      schedule,
      updateTopics: senior.preferredCallTimes?.updateTopics || [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update senior's call schedule
router.patch('/api/seniors/:id/schedule', requireAuth, validateParams(seniorIdParamSchema), async (req, res) => {
  try {
    const { schedule, updateTopics } = req.body;
    const senior = await seniorService.getById(req.params.id);

    if (!senior) {
      return res.status(404).json({ error: 'Senior not found' });
    }

    const updatedPreferredCallTimes = {
      ...senior.preferredCallTimes,
      schedule: schedule || senior.preferredCallTimes?.schedule,
      updateTopics: updateTopics || senior.preferredCallTimes?.updateTopics || [],
    };

    const updated = await seniorService.update(req.params.id, {
      preferredCallTimes: updatedPreferredCallTimes,
    });

    res.json({
      schedule: updated.preferredCallTimes?.schedule,
      updateTopics: updated.preferredCallTimes?.updateTopics || [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
