import { Router } from 'express';
import { db } from '../db/client.js';
import { seniors, conversations } from '../db/schema.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

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

// Claude Sonnet 4.6 pricing (per million tokens)
const CLAUDE_PRICING = {
  input: 3.0,      // $3/M input tokens
  output: 15.0,    // $15/M output tokens
  cache_read: 0.30, // $0.30/M cache-read tokens
};

function estimateCost(tokenUsage) {
  if (!tokenUsage) return null;
  const prompt = tokenUsage.prompt_tokens || 0;
  const completion = tokenUsage.completion_tokens || 0;
  const cacheRead = tokenUsage.cache_read_tokens || 0;
  // Subtract cache_read from prompt since cache_read tokens are charged at the lower rate
  const nonCachedInput = Math.max(0, prompt - cacheRead);
  const cost =
    (nonCachedInput / 1_000_000) * CLAUDE_PRICING.input +
    (completion / 1_000_000) * CLAUDE_PRICING.output +
    (cacheRead / 1_000_000) * CLAUDE_PRICING.cache_read;
  return Math.round(cost * 10000) / 10000; // 4 decimal places
}

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
      sentiment: conversations.sentiment,
      concerns: conversations.concerns,
      transcript: conversations.transcript,
    })
    .from(conversations)
    .leftJoin(seniors, eq(conversations.seniorId, seniors.id))
    .orderBy(desc(conversations.startedAt))
    .limit(limit);

    // Batch-fetch call_metrics for all call_sids in this page
    const callSids = calls.map(c => c.callSid).filter(Boolean);
    let metricsMap = {};
    if (callSids.length > 0) {
      const metricsRows = await db.execute(sql`
        SELECT call_sid, turn_count, token_usage, latency
        FROM call_metrics
        WHERE call_sid = ANY(${callSids})
      `);
      for (const row of metricsRows.rows) {
        metricsMap[row.call_sid] = row;
      }
    }

    // Transform to match dashboard expected format
    const formattedCalls = calls.map(call => {
      const m = metricsMap[call.callSid] || null;
      const tokenUsage = m?.token_usage
        ? (typeof m.token_usage === 'string' ? JSON.parse(m.token_usage) : m.token_usage)
        : null;
      const latency = m?.latency
        ? (typeof m.latency === 'string' ? JSON.parse(m.latency) : m.latency)
        : null;

      // Turn count: prefer call_metrics, fallback to assistant-only transcript entries
      let turnCount = 0;
      if (m?.turn_count != null) {
        turnCount = m.turn_count;
      } else if (Array.isArray(call.transcript)) {
        turnCount = call.transcript.filter(t => t.role === 'assistant').length;
      }

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
        summary: call.summary,
        sentiment: call.sentiment,
        concerns: call.concerns,
        call_metrics: tokenUsage || latency ? {
          token_usage: tokenUsage,
          latency,
          estimated_cost: estimateCost(tokenUsage),
        } : null,
        turn_count: turnCount,
      };
    });

    res.json({ calls: formattedCalls });
  } catch (error) {
    console.error('Error fetching calls:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get active calls
router.get('/api/observability/active', requireAdmin, async (req, res) => {
  const sessions = req.app.get('sessions');
  const callMetadata = req.app.get('callMetadata');
  try {
    const activeCalls = [];
    for (const [callSid, session] of sessions.entries()) {
      const metadata = callMetadata.get(callSid);
      if (metadata) {
        activeCalls.push({
          id: callSid,
          call_sid: callSid,
          senior_id: metadata.senior?.id,
          senior_name: metadata.senior?.name || 'Unknown',
          senior_phone: metadata.senior?.phone || 'Unknown',
          started_at: metadata.startedAt || new Date().toISOString(),
          status: 'in_progress',
          turn_count: session.turnCount || 0,
        });
      }
    }
    res.json({ activeCalls });
  } catch (error) {
    console.error('Error fetching active calls:', error);
    res.status(500).json({ error: error.message });
  }
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
      sentiment: conversations.sentiment,
      concerns: conversations.concerns,
      transcript: conversations.transcript,
    })
    .from(conversations)
    .leftJoin(seniors, eq(conversations.seniorId, seniors.id))
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

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
      summary: call.summary,
      sentiment: call.sentiment,
      concerns: call.concerns,
      transcript: call.transcript,
    });
  } catch (error) {
    console.error('Error fetching call:', error);
    res.status(500).json({ error: error.message });
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
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Build timeline from transcript
    const timeline = [];

    // Add call start event
    timeline.push({
      type: 'call.initiated',
      timestamp: call.startedAt,
      data: { callSid: call.callSid },
    });

    // Add transcript events if available
    if (call.transcript && Array.isArray(call.transcript)) {
      call.transcript.forEach((turn, index) => {
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
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get call turns (conversation turns)
router.get('/api/observability/calls/:id/turns', requireAdmin, async (req, res) => {
  try {
    const [call] = await db.select({
      transcript: conversations.transcript,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const turns = (call.transcript || []).map((turn, index) => ({
      id: index,
      role: turn.role,
      content: turn.content,
      timestamp: turn.timestamp,
    }));

    res.json({ turns });
  } catch (error) {
    console.error('Error fetching turns:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get observer signals for a call
router.get('/api/observability/calls/:id/observer', requireAdmin, async (req, res) => {
  try {
    const [call] = await db.select({
      id: conversations.id,
      concerns: conversations.concerns,
      sentiment: conversations.sentiment,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Query call_analyses for post-call analysis data
    const analysisRows = await db.execute(sql`
      SELECT engagement_score, concerns, positive_observations,
             call_quality, summary
      FROM call_analyses
      WHERE conversation_id = ${call.id}
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const signals = [];
    const engagementDistribution = {};
    const emotionalStateDistribution = {};
    const allConcerns = [];

    if (analysisRows.rows.length > 0) {
      const analysis = analysisRows.rows[0];

      // Parse JSONB fields — usually objects already, but safety-parse if string
      const concerns = typeof analysis.concerns === 'string'
        ? JSON.parse(analysis.concerns) : (analysis.concerns || []);
      const callQuality = typeof analysis.call_quality === 'string'
        ? JSON.parse(analysis.call_quality) : (analysis.call_quality || {});

      // Map engagement_score (1-10) to engagement level
      const score = analysis.engagement_score || 5;
      const engagementLevel = score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low';

      // Map call_quality.rapport to emotional state
      const rapport = callQuality.rapport || 'moderate';
      const emotionalStateMap = { strong: 'positive', moderate: 'neutral', weak: 'disengaged' };
      const emotionalState = emotionalStateMap[rapport] || 'neutral';

      // Confidence based on engagement score normalized to 0-1
      const confidenceScore = Math.min(1, Math.max(0, score / 10));

      // Extract concern descriptions
      const concernDescriptions = Array.isArray(concerns)
        ? concerns.map(c => c.description || (typeof c === 'string' ? c : JSON.stringify(c)))
        : [];

      // Create a single call-level signal from the analysis
      signals.push({
        turnId: 'call-analysis',
        speaker: 'System',
        turnContent: analysis.summary || '',
        timestamp: null,
        signal: {
          engagementLevel,
          emotionalState,
          confidenceScore,
          concerns: concernDescriptions,
          engagementScore: score,
          rapport: callQuality.rapport || null,
          goalsAchieved: callQuality.goals_achieved ?? null,
          durationAppropriate: callQuality.duration_appropriate ?? null,
          positiveObservations: analysis.positive_observations || [],
        },
      });

      engagementDistribution[engagementLevel] = 1;
      emotionalStateDistribution[emotionalState] = 1;
      allConcerns.push(...concernDescriptions);
    }

    // Merge in conversation-level concerns from conversations table
    const conversationConcerns = call.concerns || [];
    const uniqueConcerns = [...new Set([...allConcerns, ...conversationConcerns])];

    res.json({
      signals,
      count: signals.length,
      summary: {
        averageConfidence: signals.length > 0 ? signals[0].signal.confidenceScore : 0,
        engagementDistribution,
        emotionalStateDistribution,
        totalConcerns: uniqueConcerns.length,
        uniqueConcerns,
      },
    });
  } catch (error) {
    console.error('Error fetching observer data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get call metrics (token usage, latency, cost)
router.get('/api/observability/calls/:id/metrics', requireAdmin, async (req, res) => {
  try {
    const [call] = await db.select({
      callSid: conversations.callSid,
      durationSeconds: conversations.durationSeconds,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Fetch real metrics from call_metrics table
    let callMetrics = null;
    if (call.callSid) {
      const metricsRows = await db.execute(sql`
        SELECT turn_count, token_usage, latency, phase_durations,
               breaker_states, tools_used, error_count, end_reason
        FROM call_metrics
        WHERE call_sid = ${call.callSid}
        LIMIT 1
      `);
      if (metricsRows.rows.length > 0) {
        const m = metricsRows.rows[0];
        const tokenUsage = typeof m.token_usage === 'string' ? JSON.parse(m.token_usage) : m.token_usage;
        const latency = typeof m.latency === 'string' ? JSON.parse(m.latency) : m.latency;
        const phaseDurations = typeof m.phase_durations === 'string' ? JSON.parse(m.phase_durations) : m.phase_durations;
        const breakerStates = typeof m.breaker_states === 'string' ? JSON.parse(m.breaker_states) : m.breaker_states;

        callMetrics = {
          turn_count: m.turn_count,
          token_usage: tokenUsage,
          latency,
          phase_durations: phaseDurations,
          breaker_states: breakerStates,
          tools_used: m.tools_used,
          error_count: m.error_count,
          end_reason: m.end_reason,
          estimated_cost: estimateCost(tokenUsage),
        };
      }
    }

    res.json({
      turnMetrics: [], // Per-turn metrics not captured yet
      callMetrics,
      durationSeconds: call.durationSeconds,
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: error.message });
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
    console.error('Error fetching call metrics:', error);
    res.status(500).json({ error: error.message });
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
    console.error('Error fetching metrics summary:', error);
    res.status(500).json({ error: error.message });
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
    console.error('Error fetching latency trends:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
