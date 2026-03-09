import { Router } from 'express';
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

const router = Router();

// Health check with DB connectivity verification
router.get('/health', async (req, res) => {
  let dbStatus = 'connected';

  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    dbStatus = `error: ${err.message}`;
  }

  const statusCode = dbStatus === 'connected' ? 200 : 503;
  res.status(statusCode).json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    version: '4.1',
    db: dbStatus,
    features: ['admin-apis', 'reminder-scheduler', 'call-initiation'],
  });
});

export default router;
