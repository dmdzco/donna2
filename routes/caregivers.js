import { Router } from 'express';
import { caregiverService } from '../services/caregivers.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Get current user's seniors (uses Clerk user ID directly)
router.get('/api/caregivers/me', requireAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;

    // Get all seniors this user can access
    const seniors = await caregiverService.getSeniorsForUser(clerkUserId);

    if (seniors.length === 0) {
      // No seniors linked - they need to complete onboarding
      return res.status(404).json({ error: 'No seniors found', needsOnboarding: true });
    }

    res.json({
      clerkUserId,
      seniors,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
