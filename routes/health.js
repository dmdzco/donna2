import { Router } from 'express';
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

const router = Router();

// Health check with DB connectivity verification
router.get('/health', async (req, res) => {
  const sessions = req.app.get('sessions');
  let dbStatus = 'connected';

  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    dbStatus = `error: ${err.message}`;
  }

  const statusCode = dbStatus === 'connected' ? 200 : 503;
  res.status(statusCode).json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    version: '4.0',
    activeSessions: sessions.size,
    db: dbStatus,
    pipeline: 'pipecat + 2-layer-observer + gemini-director',
    features: ['pipecat-voice-pipeline', 'conversation-director', 'scheduled-reminders'],
  });
});

export default router;
