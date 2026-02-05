import { Router } from 'express';
import { conversationService } from '../services/conversations.js';
import { requireAuth } from '../middleware/auth.js';
import { validateParams } from '../middleware/validate.js';
import { seniorIdParamSchema } from '../validators/schemas.js';
import { getAccessibleSeniorIds, canAccessSenior } from './helpers.js';

const router = Router();

// Get conversations for a senior
router.get('/api/seniors/:id/conversations', requireAuth, validateParams(seniorIdParamSchema), async (req, res) => {
  try {
    if (!await canAccessSenior(req.auth, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }
    const convos = await conversationService.getForSenior(req.params.id, 20);
    res.json(convos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all recent conversations (admins see all, caregivers see their seniors')
router.get('/api/conversations', requireAuth, async (req, res) => {
  try {
    const convos = await conversationService.getRecent(50);
    if (req.auth.isAdmin) {
      return res.json(convos);
    }
    // Filter to accessible seniors
    const accessibleIds = await getAccessibleSeniorIds(req.auth);
    const filtered = convos.filter(c => accessibleIds.includes(c.seniorId));
    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
