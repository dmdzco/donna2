import { Router } from 'express';
import { caregiverService } from '../services/caregivers.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { db } from '../db/client.js';
import { caregivers, seniors } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = Router();

// List all caregiver-senior links (admin only)
router.get('/api/caregivers', requireAdmin, async (req, res) => {
  try {
    const links = await db.select({
      id: caregivers.id,
      clerkUserId: caregivers.clerkUserId,
      seniorId: caregivers.seniorId,
      seniorName: seniors.name,
      role: caregivers.role,
      createdAt: caregivers.createdAt,
    })
    .from(caregivers)
    .leftJoin(seniors, eq(caregivers.seniorId, seniors.id))
    .orderBy(desc(caregivers.createdAt));

    res.json(links);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
