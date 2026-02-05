import { Router } from 'express';
import { db } from '../db/client.js';
import { callAnalyses, seniors } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// List all call analyses with senior names
router.get('/api/call-analyses', requireAdmin, async (req, res) => {
  try {
    const analyses = await db.select({
      id: callAnalyses.id,
      conversationId: callAnalyses.conversationId,
      seniorId: callAnalyses.seniorId,
      seniorName: seniors.name,
      summary: callAnalyses.summary,
      topics: callAnalyses.topics,
      engagementScore: callAnalyses.engagementScore,
      concerns: callAnalyses.concerns,
      positiveObservations: callAnalyses.positiveObservations,
      followUpSuggestions: callAnalyses.followUpSuggestions,
      callQuality: callAnalyses.callQuality,
      createdAt: callAnalyses.createdAt,
    })
    .from(callAnalyses)
    .leftJoin(seniors, eq(callAnalyses.seniorId, seniors.id))
    .orderBy(desc(callAnalyses.createdAt))
    .limit(100);

    res.json(analyses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
