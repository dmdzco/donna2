import { Router } from 'express';
import { db } from '../db/client.js';
import { seniors, conversations } from '../db/schema.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import { requireAdmin } from '../middleware/auth.js';
import { decrypt, decryptJson } from '../lib/encryption.js';
import { callAnalysisService } from '../services/call-analyses.js';
import { routeError } from './helpers.js';
import { logAudit, authToRole } from '../services/audit.js';

const router = Router();

function readSummary(call, analysis = null) {
  const summary = call.summaryEncrypted ? decrypt(call.summaryEncrypted) : call.summary;
  return summary || analysis?.summary || null;
}

function readTranscript(call) {
  return call.transcriptEncrypted ? decryptJson(call.transcriptEncrypted) : call.transcript;
}

function readConcerns(call, analysis = null) {
  if (Array.isArray(call.concerns) && call.concerns.length > 0) return call.concerns;
  return Array.isArray(analysis?.concerns) ? analysis.concerns : [];
}

function auditObservabilityRead(req, resourceId = null, metadata = {}) {
  logAudit({
    userId: req.auth.userId,
    userRole: authToRole(req.auth),
    action: 'read',
    resourceType: 'conversation',
    resourceId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { surface: 'observability', ...metadata },
  });
}

// One-time cleanup: mark stale in_progress calls (older than 1 hour) as completed
db.update(conversations)
  .set({ status: 'completed', endedAt: sql`COALESCE(ended_at, started_at + interval '1 minute')` })
  .where(and(
    eq(conversations.status, 'in_progress'),
    sql`started_at < NOW() - interval '1 hour'`
  ))
  .then(result => {
    if (result.rowCount > 0) {
      console.log(`[Observability] Cleaned up ${result.rowCount} stale in_progress calls`);
    }
  })
  .catch(err => console.error('[Observability] Cleanup error:', err.message));

// Get recent calls for observability dashboard
router.get('/api/observability/calls', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const calls = await db.select({
      id: conversations.id,
      callSid: conversations.callSid,
      seniorId: conversations.seniorId,
      seniorName: seniors.name,
      seniorPhone: seniors.phone,
      startedAt: conversations.startedAt,
      endedAt: conversations.endedAt,
      durationSeconds: conversations.durationSeconds,
      status: conversations.status,
      summary: conversations.summary,
      summaryEncrypted: conversations.summaryEncrypted,
      sentiment: conversations.sentiment,
      concerns: conversations.concerns,
      callMetrics: conversations.callMetrics,
      transcript: conversations.transcript,
      transcriptEncrypted: conversations.transcriptEncrypted,
    })
    .from(conversations)
    .leftJoin(seniors, eq(conversations.seniorId, seniors.id))
    .orderBy(desc(conversations.startedAt))
    .limit(limit);

    const analyses = await callAnalysisService.getLatestByConversationIds(calls.map(call => call.id));

    // Transform to match dashboard expected format
    const formattedCalls = calls.map(call => {
      const analysis = analyses.get(call.id) || null;
      const transcript = readTranscript(call);
      return {
        id: call.id,
        call_sid: call.callSid,
        senior_id: call.seniorId,
        senior_name: call.seniorName,
        senior_phone: call.seniorPhone,
        started_at: call.startedAt,
        ended_at: call.endedAt,
        duration_seconds: call.durationSeconds,
        status: call.status || 'completed',
        summary: readSummary(call, analysis),
        sentiment: call.sentiment,
        concerns: readConcerns(call, analysis),
        call_metrics: call.callMetrics || null,
        turn_count: Array.isArray(transcript) ? transcript.length : 0,
        analysis,
      };
    });

    auditObservabilityRead(req, null, { endpoint: 'calls', limit, count: formattedCalls.length });
    res.json({ calls: formattedCalls });
  } catch (error) {
    routeError(res, error, 'GET /api/observability/calls');
  }
});

// Get active calls — voice sessions are tracked by Pipecat, not Node.js
router.get('/api/observability/active', requireAdmin, async (req, res) => {
  res.json({ activeCalls: [] });
});

// Get call details by ID
router.get('/api/observability/calls/:id', requireAdmin, async (req, res) => {
  try {
    const [call] = await db.select({
      id: conversations.id,
      callSid: conversations.callSid,
      seniorId: conversations.seniorId,
      seniorName: seniors.name,
      seniorPhone: seniors.phone,
      startedAt: conversations.startedAt,
      endedAt: conversations.endedAt,
      durationSeconds: conversations.durationSeconds,
      status: conversations.status,
      summary: conversations.summary,
      summaryEncrypted: conversations.summaryEncrypted,
      sentiment: conversations.sentiment,
      concerns: conversations.concerns,
      transcript: conversations.transcript,
      transcriptEncrypted: conversations.transcriptEncrypted,
    })
    .from(conversations)
    .leftJoin(seniors, eq(conversations.seniorId, seniors.id))
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const analyses = await callAnalysisService.getLatestByConversationIds([call.id]);
    const analysis = analyses.get(call.id) || null;
    const transcript = readTranscript(call);

    auditObservabilityRead(req, call.id, {
      endpoint: 'call_detail',
      seniorId: call.seniorId,
      includesTranscript: Boolean(transcript),
    });
    res.json({
      id: call.id,
      call_sid: call.callSid,
      senior_id: call.seniorId,
      senior_name: call.seniorName,
      senior_phone: call.seniorPhone,
      started_at: call.startedAt,
      ended_at: call.endedAt,
      duration_seconds: call.durationSeconds,
      status: call.status || 'completed',
      summary: readSummary(call, analysis),
      sentiment: call.sentiment,
      concerns: readConcerns(call, analysis),
      transcript,
      analysis,
    });
  } catch (error) {
    routeError(res, error, 'GET /api/observability/calls/:id');
  }
});

// Get call timeline (events from transcript)
router.get('/api/observability/calls/:id/timeline', requireAdmin, async (req, res) => {
  try {
    const [call] = await db.select({
      id: conversations.id,
      callSid: conversations.callSid,
      seniorId: conversations.seniorId,
      startedAt: conversations.startedAt,
      endedAt: conversations.endedAt,
      durationSeconds: conversations.durationSeconds,
      status: conversations.status,
      transcript: conversations.transcript,
      transcriptEncrypted: conversations.transcriptEncrypted,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Build timeline from transcript
    const timeline = [];
    const transcript = readTranscript(call);

    // Add call start event
    timeline.push({
      type: 'call.initiated',
      timestamp: call.startedAt,
      data: { callSid: call.callSid },
    });

    // Add transcript events if available
    if (Array.isArray(transcript)) {
      transcript.forEach((turn, index) => {
        if (turn.role === 'user') {
          timeline.push({
            type: 'turn.transcribed',
            timestamp: turn.timestamp || call.startedAt,
            data: { content: turn.content, turnIndex: index },
          });
        } else if (turn.role === 'assistant') {
          timeline.push({
            type: 'turn.response',
            timestamp: turn.timestamp || call.startedAt,
            data: { content: turn.content, turnIndex: index },
          });
        }
        // Add observer signals if present
        if (turn.observer) {
          timeline.push({
            type: 'observer.signal',
            timestamp: turn.timestamp || call.startedAt,
            data: turn.observer,
          });
        }
      });
    }

    // Add call end event
    if (call.endedAt) {
      timeline.push({
        type: 'call.ended',
        timestamp: call.endedAt,
        data: { durationSeconds: call.durationSeconds },
      });
    }

    auditObservabilityRead(req, call.id, {
      endpoint: 'timeline',
      seniorId: call.seniorId,
      eventCount: timeline.length,
    });
    res.json({
      callId: call.id,
      callSid: call.callSid,
      seniorId: call.seniorId,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      status: call.status || 'completed',
      timeline,
    });
  } catch (error) {
    routeError(res, error, 'GET /api/observability/calls/:id/timeline');
  }
});

// Get call turns (conversation turns)
router.get('/api/observability/calls/:id/turns', requireAdmin, async (req, res) => {
  try {
    const [call] = await db.select({
      transcript: conversations.transcript,
      transcriptEncrypted: conversations.transcriptEncrypted,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const transcript = readTranscript(call);
    const turns = (Array.isArray(transcript) ? transcript : []).map((turn, index) => ({
      id: index,
      role: turn.role,
      content: turn.content,
      timestamp: turn.timestamp,
    }));

    auditObservabilityRead(req, req.params.id, {
      endpoint: 'turns',
      turnCount: turns.length,
    });
    res.json({ turns });
  } catch (error) {
    routeError(res, error, 'GET /api/observability/calls/:id/turns');
  }
});

// Get observer signals for a call
router.get('/api/observability/calls/:id/observer', requireAdmin, async (req, res) => {
  try {
    const [call] = await db.select({
      transcript: conversations.transcript,
      transcriptEncrypted: conversations.transcriptEncrypted,
      concerns: conversations.concerns,
      sentiment: conversations.sentiment,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Extract observer signals from transcript
    const signals = [];
    const engagementDistribution = {};
    const emotionalStateDistribution = {};
    const allConcerns = [];
    let totalConfidence = 0;

    const transcript = readTranscript(call);
    if (Array.isArray(transcript)) {
      transcript.forEach((turn, index) => {
        if (turn.observer) {
          const engagementLevel = turn.observer.engagement_level || turn.observer.engagementLevel || 'medium';
          const emotionalState = turn.observer.emotional_state || turn.observer.emotionalState || 'neutral';
          const confidenceScore = turn.observer.confidence_score || turn.observer.confidenceScore || 0.5;
          const concerns = turn.observer.concerns || [];

          signals.push({
            turnId: String(index),
            speaker: turn.role === 'user' ? 'Senior' : 'Donna',
            turnContent: turn.content || '',
            timestamp: turn.timestamp,
            signal: {
              engagementLevel,
              emotionalState,
              confidenceScore,
              concerns,
              shouldDeliverReminder: turn.observer.should_deliver_reminder || turn.observer.shouldDeliverReminder || false,
              shouldEndCall: turn.observer.should_end_call || turn.observer.shouldEndCall || false,
            },
          });

          engagementDistribution[engagementLevel] = (engagementDistribution[engagementLevel] || 0) + 1;
          emotionalStateDistribution[emotionalState] = (emotionalStateDistribution[emotionalState] || 0) + 1;
          totalConfidence += confidenceScore;
          allConcerns.push(...concerns);
        }
      });
    }

    const uniqueConcerns = [...new Set([...allConcerns, ...(call.concerns || [])])];

    auditObservabilityRead(req, req.params.id, {
      endpoint: 'observer',
      signalCount: signals.length,
    });
    res.json({
      signals,
      count: signals.length,
      summary: {
        averageConfidence: signals.length > 0 ? totalConfidence / signals.length : 0,
        engagementDistribution,
        emotionalStateDistribution,
        totalConcerns: uniqueConcerns.length,
        uniqueConcerns,
      },
    });
  } catch (error) {
    routeError(res, error, 'GET /api/observability/calls/:id/observer');
  }
});

// Get call metrics (token usage, latency, cost)
router.get('/api/observability/calls/:id/metrics', requireAdmin, async (req, res) => {
  try {
    const [call] = await db.select({
      transcript: conversations.transcript,
      transcriptEncrypted: conversations.transcriptEncrypted,
      callMetrics: conversations.callMetrics,
      durationSeconds: conversations.durationSeconds,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Extract per-turn metrics from transcript
    const turnMetrics = [];
    const transcript = readTranscript(call);
    if (Array.isArray(transcript)) {
      transcript.forEach((turn, index) => {
        if (turn.metrics) {
          turnMetrics.push({
            turnIndex: index,
            role: turn.role,
            ...turn.metrics,
          });
        }
      });
    }

    auditObservabilityRead(req, req.params.id, {
      endpoint: 'call_metrics',
      metricTurnCount: turnMetrics.length,
    });
    res.json({
      turnMetrics,
      callMetrics: call.callMetrics || null,
      durationSeconds: call.durationSeconds,
    });
  } catch (error) {
    routeError(res, error, 'GET /api/observability/metrics');
  }
});

// -------------------------------------------------------------------------
// Infrastructure Metrics (from call_metrics table)
// -------------------------------------------------------------------------

// Get recent call metrics for the infrastructure dashboard
router.get('/api/observability/metrics/calls', requireAdmin, async (req, res) => {
  try {
    const hours = Math.min(Math.max(parseInt(req.query.hours) || 24, 1), 168);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 500);

    const rows = await db.execute(sql`
      SELECT call_sid, senior_id, call_type, duration_seconds,
             end_reason, turn_count, phase_durations, latency,
             breaker_states, tools_used, token_usage, error_count,
             created_at
      FROM call_metrics
      WHERE created_at >= NOW() - ${hours + ' hours'}::interval
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    res.json({ metrics: rows.rows, hours });
  } catch (error) {
    routeError(res, error, 'GET /api/observability/calls/:id/metrics');
  }
});

// Get aggregated metrics summary for dashboard widgets
router.get('/api/observability/metrics/summary', requireAdmin, async (req, res) => {
  try {
    const hours = Math.min(Math.max(parseInt(req.query.hours) || 24, 1), 168);

    const summaryResult = await db.execute(sql`
      SELECT
        COUNT(*) AS total_calls,
        COUNT(*) FILTER (WHERE error_count = 0) AS successful_calls,
        ROUND(AVG(duration_seconds)) AS avg_duration_seconds,
        ROUND(AVG(turn_count)) AS avg_turn_count,
        ROUND(AVG((latency->>'llm_ttfb_avg_ms')::numeric)) AS avg_llm_ttfb_ms,
        ROUND(AVG((latency->>'tts_ttfb_avg_ms')::numeric)) AS avg_tts_ttfb_ms,
        ROUND(AVG((latency->>'turn_avg_ms')::numeric)) AS avg_turn_latency_ms
      FROM call_metrics
      WHERE created_at >= NOW() - ${hours + ' hours'}::interval
    `);

    const endReasons = await db.execute(sql`
      SELECT end_reason, COUNT(*)::int AS count
      FROM call_metrics
      WHERE created_at >= NOW() - ${hours + ' hours'}::interval
      GROUP BY end_reason
      ORDER BY count DESC
    `);

    res.json({
      summary: summaryResult.rows[0] || {},
      end_reasons: endReasons.rows,
      hours,
    });
  } catch (error) {
    routeError(res, error, 'GET /api/observability/metrics/summary');
  }
});

// Get latency trends (hourly averages for charts)
router.get('/api/observability/metrics/latency', requireAdmin, async (req, res) => {
  try {
    const hours = Math.min(Math.max(parseInt(req.query.hours) || 24, 1), 168);

    const rows = await db.execute(sql`
      SELECT
        date_trunc('hour', created_at) AS hour,
        COUNT(*) AS call_count,
        ROUND(AVG((latency->>'llm_ttfb_avg_ms')::numeric)) AS llm_ttfb_ms,
        ROUND(AVG((latency->>'tts_ttfb_avg_ms')::numeric)) AS tts_ttfb_ms,
        ROUND(AVG((latency->>'turn_avg_ms')::numeric)) AS turn_latency_ms,
        ROUND(AVG(duration_seconds)) AS avg_duration
      FROM call_metrics
      WHERE created_at >= NOW() - ${hours + ' hours'}::interval
        AND latency IS NOT NULL
      GROUP BY date_trunc('hour', created_at)
      ORDER BY hour ASC
    `);

    res.json({ latency: rows.rows, hours });
  } catch (error) {
    routeError(res, error, 'GET /api/observability/metrics/latency-trends');
  }
});

export default router;
