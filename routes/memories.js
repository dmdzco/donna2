import { Router } from 'express';
import { memoryService } from '../services/memory.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { createMemorySchema, seniorIdParamSchema } from '../validators/schemas.js';
import { canAccessSenior, routeError } from './helpers.js';
import { logAudit, authToRole } from '../services/audit.js';

const router = Router();

// Store a memory for a senior
router.post('/api/seniors/:id/memories', requireAuth, writeLimiter, validateParams(seniorIdParamSchema), validateBody(createMemorySchema), async (req, res) => {
  const { type, content, importance } = req.body;
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    logAudit({
      userId: req.auth.userId,
      userRole: authToRole(req.auth),
      action: 'create',
      resourceType: 'memory',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { seniorId: req.params.id, memoryType: type },
    });
    const memory = await memoryService.store(
      req.params.id,
      type,
      content,
      'manual',
      importance
    );
    res.json(memory);
  } catch (error) {
    routeError(res, error, 'POST /api/seniors/:id/memories');
  }
});

// Search memories for a senior
router.get('/api/seniors/:id/memories/search', requireAuth, validateParams(seniorIdParamSchema), async (req, res) => {
  const { q, limit } = req.query;
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    logAudit({
      userId: req.auth.userId,
      userRole: authToRole(req.auth),
      action: 'read',
      resourceType: 'memory',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { seniorId: req.params.id, query: q },
    });
    const memories = await memoryService.search(
      req.params.id,
      q,
      parseInt(limit) || 5
    );
    res.json(memories);
  } catch (error) {
    routeError(res, error, 'GET /api/seniors/:id/memories/search');
  }
});

// Get recent memories for a senior
router.get('/api/seniors/:id/memories', requireAuth, validateParams(seniorIdParamSchema), async (req, res) => {
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    logAudit({
      userId: req.auth.userId,
      userRole: authToRole(req.auth),
      action: 'read',
      resourceType: 'memory',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { seniorId: req.params.id },
    });
    const memories = await memoryService.getRecent(req.params.id, 20);
    res.json(memories);
  } catch (error) {
    routeError(res, error, 'GET /api/seniors/:id/memories');
  }
});

export default router;
