import { Router } from 'express';
import { memoryService } from '../services/memory.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { createMemorySchema, seniorIdParamSchema } from '../validators/schemas.js';
import { canAccessSenior } from './helpers.js';

const router = Router();

// Store a memory for a senior
router.post('/api/seniors/:id/memories', requireAuth, writeLimiter, validateParams(seniorIdParamSchema), validateBody(createMemorySchema), async (req, res) => {
  const { type, content, importance } = req.body;
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    const memory = await memoryService.store(
      req.params.id,
      type,
      content,
      'manual',
      importance
    );
    res.json(memory);
  } catch (error) {
    console.error('Failed to store memory:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search memories for a senior
router.get('/api/seniors/:id/memories/search', requireAuth, validateParams(seniorIdParamSchema), async (req, res) => {
  const { q, limit } = req.query;
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    const memories = await memoryService.search(
      req.params.id,
      q,
      parseInt(limit) || 5
    );
    res.json(memories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recent memories for a senior
router.get('/api/seniors/:id/memories', requireAuth, validateParams(seniorIdParamSchema), async (req, res) => {
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    const memories = await memoryService.getRecent(req.params.id, 20);
    res.json(memories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
