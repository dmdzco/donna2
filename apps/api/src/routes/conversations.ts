import { Router } from 'express';
import { db } from '../db/client.js';
import { AppError } from '../middleware/error-handler.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

export const conversationsRouter = Router();

conversationsRouter.use(authenticate);

// List conversations for a senior
conversationsRouter.get('/senior/:seniorId', async (req: AuthRequest, res, next) => {
  try {
    // Verify senior belongs to caregiver
    const seniorCheck = await db.query(
      'SELECT id FROM seniors WHERE id = $1 AND caregiver_id = $2',
      [req.params.seniorId, req.caregiverId]
    );

    if (seniorCheck.rows.length === 0) {
      throw new AppError(404, 'Senior not found');
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await db.query(
      `SELECT id, started_at, ended_at, duration_seconds, status,
              initiated_by, summary, sentiment, concerns
       FROM conversations
       WHERE senior_id = $1
       ORDER BY started_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.seniorId, limit, offset]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) FROM conversations WHERE senior_id = $1',
      [req.params.seniorId]
    );

    res.json({
      conversations: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    });
  } catch (error) {
    next(error);
  }
});

// Get single conversation with transcript
conversationsRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const result = await db.query(
      `SELECT c.* FROM conversations c
       JOIN seniors s ON c.senior_id = s.id
       WHERE c.id = $1 AND s.caregiver_id = $2`,
      [req.params.id, req.caregiverId]
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Conversation not found');
    }

    // Get conversation turns
    const turnsResult = await db.query(
      `SELECT id, speaker, content, audio_segment_url, timestamp_offset_ms, created_at
       FROM conversation_turns
       WHERE conversation_id = $1
       ORDER BY timestamp_offset_ms`,
      [req.params.id]
    );

    res.json({
      conversation: result.rows[0],
      turns: turnsResult.rows,
    });
  } catch (error) {
    next(error);
  }
});

// Get conversation audio URL
conversationsRouter.get('/:id/audio', async (req: AuthRequest, res, next) => {
  try {
    const result = await db.query(
      `SELECT c.audio_url FROM conversations c
       JOIN seniors s ON c.senior_id = s.id
       WHERE c.id = $1 AND s.caregiver_id = $2`,
      [req.params.id, req.caregiverId]
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Conversation not found');
    }

    if (!result.rows[0].audio_url) {
      throw new AppError(404, 'Audio not available for this conversation');
    }

    res.json({ audioUrl: result.rows[0].audio_url });
  } catch (error) {
    next(error);
  }
});

// Get conversation statistics for a senior
conversationsRouter.get('/senior/:seniorId/stats', async (req: AuthRequest, res, next) => {
  try {
    // Verify senior belongs to caregiver
    const seniorCheck = await db.query(
      'SELECT id FROM seniors WHERE id = $1 AND caregiver_id = $2',
      [req.params.seniorId, req.caregiverId]
    );

    if (seniorCheck.rows.length === 0) {
      throw new AppError(404, 'Senior not found');
    }

    const stats = await db.query(
      `SELECT
        COUNT(*) as total_conversations,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'no_answer') as missed,
        AVG(duration_seconds) FILTER (WHERE status = 'completed') as avg_duration,
        MAX(started_at) as last_conversation
       FROM conversations
       WHERE senior_id = $1`,
      [req.params.seniorId]
    );

    res.json({ stats: stats.rows[0] });
  } catch (error) {
    next(error);
  }
});
