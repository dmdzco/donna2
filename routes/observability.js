import { Router } from 'express';
import { db } from '../db/client.js';
import { seniors, conversations } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

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
      callMetrics: conversations.callMetrics,
    })
    .from(conversations)
    .leftJoin(seniors, eq(conversations.seniorId, seniors.id))
    .orderBy(desc(conversations.startedAt))
    .limit(limit);

    // Transform to match dashboard expected format
    const formattedCalls = calls.map(call => ({
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
      call_metrics: call.callMetrics || null,
      turn_count: 0, // Will be populated from transcript if available
    }));

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
      startedAt: conversations.startedAt,
      endedAt: conversations.endedAt,
      durationSeconds: conversations.durationSeconds,
      transcript: conversations.transcript,
    })
    .from(conversations)
    .where(eq(conversations.id, req.params.id));

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Build timeline from transcript
    const events = [];

    // Add call start event
    events.push({
      type: 'call.initiated',
      timestamp: call.startedAt,
      data: { callSid: call.callSid },
    });

    // Add transcript events if available
    if (call.transcript && Array.isArray(call.transcript)) {
      call.transcript.forEach((turn, index) => {
        if (turn.role === 'user') {
          events.push({
            type: 'turn.transcribed',
            timestamp: turn.timestamp || call.startedAt,
            data: { content: turn.content, turnIndex: index },
          });
        } else if (turn.role === 'assistant') {
          events.push({
            type: 'turn.response',
            timestamp: turn.timestamp || call.startedAt,
            data: { content: turn.content, turnIndex: index },
          });
        }
        // Add observer signals if present
        if (turn.observer) {
          events.push({
            type: 'observer.signal',
            timestamp: turn.timestamp || call.startedAt,
            data: turn.observer,
          });
        }
      });
    }

    // Add call end event
    if (call.endedAt) {
      events.push({
        type: 'call.ended',
        timestamp: call.endedAt,
        data: { durationSeconds: call.durationSeconds },
      });
    }

    res.json({
      callId: call.id,
      events,
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
      transcript: conversations.transcript,
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
    if (call.transcript && Array.isArray(call.transcript)) {
      call.transcript.forEach((turn) => {
        if (turn.observer) {
          signals.push({
            timestamp: turn.timestamp,
            engagementLevel: turn.observer.engagement_level || turn.observer.engagementLevel,
            emotionalState: turn.observer.emotional_state || turn.observer.emotionalState,
            concerns: turn.observer.concerns || [],
            suggestedTopic: turn.observer.suggested_topic || turn.observer.suggestedTopic,
            shouldDeliverReminder: turn.observer.should_deliver_reminder || turn.observer.shouldDeliverReminder,
            shouldEndCall: turn.observer.should_end_call || turn.observer.shouldEndCall,
          });
        }
      });
    }

    // Calculate aggregates
    const aggregates = {
      avgEngagement: 'medium',
      dominantEmotion: call.sentiment || 'neutral',
      totalConcerns: (call.concerns || []).length,
      concerns: call.concerns || [],
    };

    res.json({ signals, aggregates });
  } catch (error) {
    console.error('Error fetching observer data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get call metrics (token usage, latency, cost)
router.get('/api/observability/calls/:id/metrics', requireAdmin, async (req, res) => {
  try {
    const [call] = await db.select({
      transcript: conversations.transcript,
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
    if (call.transcript && Array.isArray(call.transcript)) {
      call.transcript.forEach((turn, index) => {
        if (turn.metrics) {
          turnMetrics.push({
            turnIndex: index,
            role: turn.role,
            ...turn.metrics,
          });
        }
      });
    }

    res.json({
      turnMetrics,
      callMetrics: call.callMetrics || null,
      durationSeconds: call.durationSeconds,
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
