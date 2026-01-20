import { Router } from 'express';
import { db } from '../db/client.js';
import { loggers } from '@donna/logger';
import { observabilityService } from '../services/observability-service.js';

const log = loggers.api;

export const observabilityRouter = Router();

/**
 * GET /api/observability/active
 * List currently active (in_progress) calls
 */
observabilityRouter.get('/active', async (_req, res, next) => {
  try {
    const activeCalls = await observabilityService.getActiveCalls();
    res.json({ activeCalls, count: activeCalls.length });
  } catch (error) {
    log.error({ error: (error as Error).message }, 'Failed to fetch active calls');
    next(error);
  }
});

/**
 * GET /api/observability/calls
 * List recent calls with summary info
 */
observabilityRouter.get('/calls', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await db.query(
      `SELECT
        c.id,
        c.senior_id,
        c.call_sid,
        c.started_at,
        c.ended_at,
        c.duration_seconds,
        c.status,
        c.initiated_by,
        c.summary,
        c.sentiment,
        c.concerns,
        s.name as senior_name,
        s.phone as senior_phone,
        (SELECT COUNT(*) FROM conversation_turns WHERE conversation_id = c.id) as turn_count
      FROM conversations c
      LEFT JOIN seniors s ON c.senior_id = s.id
      ORDER BY c.started_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      calls: result.rows,
      pagination: { limit, offset, total: result.rowCount },
    });
  } catch (error) {
    log.error({ error: (error as Error).message }, 'Failed to fetch calls');
    next(error);
  }
});

/**
 * GET /api/observability/calls/:id
 * Get detailed info for a single call
 */
observabilityRouter.get('/calls/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT
        c.*,
        s.name as senior_name,
        s.phone as senior_phone,
        s.timezone as senior_timezone
      FROM conversations c
      LEFT JOIN seniors s ON c.senior_id = s.id
      WHERE c.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    log.error({ error: (error as Error).message, callId: req.params.id }, 'Failed to fetch call');
    next(error);
  }
});

/**
 * GET /api/observability/calls/:id/timeline
 * Get chronological timeline of all events for a call
 */
observabilityRouter.get('/calls/:id/timeline', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get conversation details
    const convResult = await db.query(
      'SELECT * FROM conversations WHERE id = $1',
      [id]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const conversation = convResult.rows[0];

    // Get all turns for the conversation
    const turnsResult = await db.query(
      `SELECT
        id,
        speaker,
        content,
        observer_signals,
        created_at as timestamp
      FROM conversation_turns
      WHERE conversation_id = $1
      ORDER BY created_at ASC`,
      [id]
    );

    // Get observability events if any exist
    const eventsResult = await db.query(
      `SELECT
        id,
        event_type,
        timestamp,
        data,
        metadata
      FROM observability_events
      WHERE conversation_id = $1 OR call_id = $2
      ORDER BY timestamp ASC`,
      [id, conversation.call_sid]
    );

    // Build unified timeline
    const timeline = [];

    // Add call start event
    timeline.push({
      type: 'call.initiated',
      timestamp: conversation.started_at,
      data: {
        callSid: conversation.call_sid,
        initiatedBy: conversation.initiated_by,
      },
    });

    // Add turns as events
    for (const turn of turnsResult.rows) {
      timeline.push({
        type: turn.speaker === 'senior' ? 'turn.transcribed' : 'turn.response',
        timestamp: turn.timestamp,
        data: {
          speaker: turn.speaker,
          content: turn.content,
          observerSignals: turn.observer_signals,
        },
      });

      // If this turn has observer signals, add as separate event
      if (turn.observer_signals) {
        timeline.push({
          type: 'observer.signal',
          timestamp: turn.timestamp,
          data: turn.observer_signals,
        });
      }
    }

    // Add observability events
    for (const event of eventsResult.rows) {
      timeline.push({
        type: event.event_type,
        timestamp: event.timestamp,
        data: event.data,
        metadata: event.metadata,
      });
    }

    // Add call end event if ended
    if (conversation.ended_at) {
      timeline.push({
        type: 'call.ended',
        timestamp: conversation.ended_at,
        data: {
          status: conversation.status,
          durationSeconds: conversation.duration_seconds,
        },
      });
    }

    // Sort by timestamp
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    res.json({
      callId: id,
      callSid: conversation.call_sid,
      seniorId: conversation.senior_id,
      startedAt: conversation.started_at,
      endedAt: conversation.ended_at,
      status: conversation.status,
      timeline,
    });
  } catch (error) {
    log.error({ error: (error as Error).message, callId: req.params.id }, 'Failed to fetch timeline');
    next(error);
  }
});

/**
 * GET /api/observability/calls/:id/turns
 * Get all conversation turns for a call
 */
observabilityRouter.get('/calls/:id/turns', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT
        id,
        speaker,
        content,
        audio_segment_url,
        timestamp_offset_ms,
        observer_signals,
        created_at as timestamp
      FROM conversation_turns
      WHERE conversation_id = $1
      ORDER BY created_at ASC`,
      [id]
    );

    res.json({
      callId: id,
      turns: result.rows,
      count: result.rowCount,
    });
  } catch (error) {
    log.error({ error: (error as Error).message, callId: req.params.id }, 'Failed to fetch turns');
    next(error);
  }
});

/**
 * GET /api/observability/calls/:id/observer
 * Get all observer signals for a call
 */
observabilityRouter.get('/calls/:id/observer', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get observer signals from turns
    const turnsResult = await db.query(
      `SELECT
        id as turn_id,
        speaker,
        content,
        observer_signals,
        created_at as timestamp
      FROM conversation_turns
      WHERE conversation_id = $1 AND observer_signals IS NOT NULL
      ORDER BY created_at ASC`,
      [id]
    );

    // Get observer signals from observability events
    const eventsResult = await db.query(
      `SELECT
        id,
        timestamp,
        data as signal
      FROM observability_events
      WHERE conversation_id = $1 AND event_type = 'observer.signal'
      ORDER BY timestamp ASC`,
      [id]
    );

    // Combine and format signals
    const signals = turnsResult.rows.map((row) => ({
      turnId: row.turn_id,
      speaker: row.speaker,
      turnContent: row.content,
      timestamp: row.timestamp,
      signal: row.observer_signals,
    }));

    // Calculate aggregates
    const engagementLevels = signals.map(s => s.signal?.engagementLevel).filter(Boolean);
    const emotionalStates = signals.map(s => s.signal?.emotionalState).filter(Boolean);
    const allConcerns = signals.flatMap(s => s.signal?.concerns || []);

    res.json({
      callId: id,
      signals,
      count: signals.length,
      summary: {
        averageConfidence: signals.reduce((sum, s) => sum + (s.signal?.confidenceScore || 0), 0) / (signals.length || 1),
        engagementDistribution: countOccurrences(engagementLevels),
        emotionalStateDistribution: countOccurrences(emotionalStates),
        totalConcerns: allConcerns.length,
        uniqueConcerns: [...new Set(allConcerns)],
      },
    });
  } catch (error) {
    log.error({ error: (error as Error).message, callId: req.params.id }, 'Failed to fetch observer signals');
    next(error);
  }
});

/**
 * GET /api/observability/continuity/:seniorId
 * Get conversation continuity for a senior (last 10 turns across calls)
 */
observabilityRouter.get('/continuity/:seniorId', async (req, res, next) => {
  try {
    const { seniorId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    // Get recent turns across all conversations for this senior
    const turnsResult = await db.query(
      `SELECT
        t.id,
        t.conversation_id,
        t.speaker,
        t.content,
        t.observer_signals,
        t.created_at as timestamp,
        c.started_at as conversation_started_at,
        c.status as conversation_status
      FROM conversation_turns t
      INNER JOIN conversations c ON t.conversation_id = c.id
      WHERE c.senior_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2`,
      [seniorId, limit]
    );

    // Reverse to get chronological order
    const recentTurns = turnsResult.rows.reverse();

    // Find the senior's last turn
    const lastSeniorTurn = [...turnsResult.rows].find(t => t.speaker === 'senior');

    // Check if last conversation was dropped
    const lastConvResult = await db.query(
      `SELECT status, started_at FROM conversations
       WHERE senior_id = $1
       ORDER BY started_at DESC
       LIMIT 1`,
      [seniorId]
    );

    const lastConv = lastConvResult.rows[0];
    const lastCallDropped = lastConv
      ? lastConv.status === 'failed' ||
        (lastConv.status === 'in_progress' &&
          new Date(lastConv.started_at) < new Date(Date.now() - 30 * 60 * 1000))
      : false;

    res.json({
      seniorId,
      recentTurns,
      lastSeniorTurn: lastSeniorTurn || null,
      lastCallDropped,
      lastInteractionAt: recentTurns.length > 0 ? recentTurns[recentTurns.length - 1].timestamp : null,
      turnCount: recentTurns.length,
    });
  } catch (error) {
    log.error({ error: (error as Error).message, seniorId: req.params.seniorId }, 'Failed to fetch continuity');
    next(error);
  }
});

/**
 * Helper function to count occurrences
 */
function countOccurrences(arr: string[]): Record<string, number> {
  return arr.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
