/**
 * Observability API Integration Tests
 *
 * Makes REAL HTTP requests to the dev API at Railway to validate:
 * 1. Routes are mounted and accessible
 * 2. DB queries work with real seed data
 * 3. Response shapes match frontend (observability dashboard) expectations
 *
 * Prerequisites (one of):
 * - TEST_AUTH_TOKEN: a pre-generated admin JWT
 * - TEST_JWT_SECRET: JWT secret to generate a token
 * - TEST_COFOUNDER_KEY: X-API-Key for cofounder bypass auth
 *
 * Run:
 *   TEST_JWT_SECRET=<secret> npx vitest run tests/integration/api/observability.test.js
 *   TEST_COFOUNDER_KEY=<key> npx vitest run tests/integration/api/observability.test.js
 *   TEST_AUTH_TOKEN=<jwt> npx vitest run tests/integration/api/observability.test.js
 */

import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';

const API_BASE = process.env.TEST_API_URL || 'https://donna-api-dev.up.railway.app';

// ---------------------------------------------------------------------------
// Auth resolution: JWT Bearer OR X-API-Key cofounder bypass
// ---------------------------------------------------------------------------
function resolveAuth() {
  // Option 1: Pre-generated JWT token
  if (process.env.TEST_AUTH_TOKEN) {
    return { type: 'bearer', token: process.env.TEST_AUTH_TOKEN };
  }
  // Option 2: Generate JWT from secret
  if (process.env.TEST_JWT_SECRET) {
    const token = jwt.sign(
      { adminId: 'integration-test-admin', role: 'admin' },
      process.env.TEST_JWT_SECRET,
      { expiresIn: '1h' },
    );
    return { type: 'bearer', token };
  }
  // Option 3: Cofounder API key (bypasses Clerk entirely)
  if (process.env.TEST_COFOUNDER_KEY) {
    return { type: 'apikey', token: process.env.TEST_COFOUNDER_KEY };
  }
  return null;
}

const auth = resolveAuth();
const authToken = auth?.token || null;

// ---------------------------------------------------------------------------
// Helper: authenticated fetch
// ---------------------------------------------------------------------------
async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const authHeaders = {};
  if (auth?.type === 'bearer') {
    authHeaders['Authorization'] = `Bearer ${auth.token}`;
  } else if (auth?.type === 'apikey') {
    authHeaders['X-API-Key'] = auth.token;
  }
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders,
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body };
}

// A UUID that will never exist in the database
const NON_EXISTENT_ID = '00000000-0000-0000-0000-000000000000';

// ---------------------------------------------------------------------------
// Skip entire suite when no auth credentials are available
// ---------------------------------------------------------------------------
describe.skipIf(!auth)('Observability API Integration Tests', () => {
  // We will resolve a real call ID from the /calls endpoint during beforeAll
  let callId;
  let callWithTranscript;

  beforeAll(async () => {
    // Fetch a small page of calls to extract a real call ID for sub-resource tests
    const { body } = await apiFetch('/api/observability/calls?limit=5');
    if (body?.calls?.length > 0) {
      // Prefer a call that has a transcript so sub-resource tests are meaningful
      callWithTranscript = body.calls.find(
        (c) => Array.isArray(c.transcript) && c.transcript.length > 0,
      );
      callId = (callWithTranscript || body.calls[0]).id;
    }
  }, 15_000);

  // =========================================================================
  // GET /api/observability/calls
  // =========================================================================
  describe('GET /api/observability/calls', () => {
    it('returns 401 without auth token', async () => {
      const url = `${API_BASE}/api/observability/calls`;
      const res = await fetch(url);
      expect(res.status).toBe(401);
    });

    it('returns a calls array', async () => {
      const { status, body } = await apiFetch('/api/observability/calls');

      expect(status).toBe(200);
      expect(body).toHaveProperty('calls');
      expect(Array.isArray(body.calls)).toBe(true);
    });

    it('each call has required top-level fields', async () => {
      const { body } = await apiFetch('/api/observability/calls?limit=3');
      if (body.calls.length === 0) return; // No data in dev — skip gracefully

      const requiredFields = [
        'id',
        'call_sid',
        'senior_id',
        'senior_name',
        'started_at',
        'status',
        'turn_count',
      ];

      for (const call of body.calls) {
        for (const field of requiredFields) {
          expect(call).toHaveProperty(field);
        }
        // status should be a known value
        expect(['completed', 'in_progress', 'failed', 'missed', 'no_answer']).toContain(
          call.status,
        );
      }
    });

    it('each call has call_metrics as object or null', async () => {
      const { body } = await apiFetch('/api/observability/calls?limit=5');
      if (body.calls.length === 0) return;

      for (const call of body.calls) {
        expect(call).toHaveProperty('call_metrics');
        if (call.call_metrics !== null) {
          const metricsFields = [
            'totalInputTokens',
            'totalOutputTokens',
            'totalTokens',
            'avgResponseTime',
            'avgTtfa',
            'turnCount',
            'estimatedCost',
            'modelsUsed',
          ];
          for (const field of metricsFields) {
            expect(call.call_metrics).toHaveProperty(field);
          }
          expect(Array.isArray(call.call_metrics.modelsUsed)).toBe(true);
          expect(typeof call.call_metrics.totalTokens).toBe('number');
        }
      }
    });

    it('respects ?limit=N query parameter', async () => {
      const { body: bodySmall } = await apiFetch('/api/observability/calls?limit=2');
      expect(bodySmall.calls.length).toBeLessThanOrEqual(2);
    });

    it('calls are ordered by started_at descending', async () => {
      const { body } = await apiFetch('/api/observability/calls?limit=10');
      if (body.calls.length < 2) return;

      for (let i = 1; i < body.calls.length; i++) {
        const prev = new Date(body.calls[i - 1].started_at).getTime();
        const curr = new Date(body.calls[i].started_at).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });
  });

  // =========================================================================
  // GET /api/observability/calls/:id
  // =========================================================================
  describe('GET /api/observability/calls/:id', () => {
    it('returns 404 for non-existent call', async () => {
      const { status, body } = await apiFetch(
        `/api/observability/calls/${NON_EXISTENT_ID}`,
      );
      expect(status).toBe(404);
      expect(body).toHaveProperty('error');
    });

    it('returns single call with required fields', async () => {
      if (!callId) return; // No seed data

      const { status, body } = await apiFetch(`/api/observability/calls/${callId}`);
      expect(status).toBe(200);

      const fields = [
        'id',
        'call_sid',
        'senior_id',
        'senior_name',
        'started_at',
        'status',
        'transcript',
      ];
      for (const field of fields) {
        expect(body).toHaveProperty(field);
      }
      expect(body.id).toBe(callId);
    });

    it('transcript is an array (or null)', async () => {
      if (!callId) return;

      const { body } = await apiFetch(`/api/observability/calls/${callId}`);
      if (body.transcript !== null) {
        expect(Array.isArray(body.transcript)).toBe(true);
      }
    });

    it('returns 401 without auth', async () => {
      if (!callId) return;
      const url = `${API_BASE}/api/observability/calls/${callId}`;
      const res = await fetch(url);
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // GET /api/observability/calls/:id/timeline
  // =========================================================================
  describe('GET /api/observability/calls/:id/timeline', () => {
    it('returns 404 for non-existent call', async () => {
      const { status } = await apiFetch(
        `/api/observability/calls/${NON_EXISTENT_ID}/timeline`,
      );
      expect(status).toBe(404);
    });

    it('returns timeline with expected envelope', async () => {
      if (!callId) return;

      const { status, body } = await apiFetch(
        `/api/observability/calls/${callId}/timeline`,
      );
      expect(status).toBe(200);

      const envelope = ['callId', 'callSid', 'seniorId', 'startedAt', 'status', 'timeline'];
      for (const key of envelope) {
        expect(body).toHaveProperty(key);
      }
      expect(body.callId).toBe(callId);
      expect(Array.isArray(body.timeline)).toBe(true);
    });

    it('timeline starts with call.initiated event', async () => {
      if (!callId) return;

      const { body } = await apiFetch(
        `/api/observability/calls/${callId}/timeline`,
      );
      if (body.timeline.length === 0) return;

      expect(body.timeline[0].type).toBe('call.initiated');
      expect(body.timeline[0]).toHaveProperty('timestamp');
      expect(body.timeline[0]).toHaveProperty('data');
    });

    it('timeline events have valid types', async () => {
      if (!callId) return;

      const { body } = await apiFetch(
        `/api/observability/calls/${callId}/timeline`,
      );

      const validTypes = ['call.initiated', 'turn.transcribed', 'turn.response', 'call.ended'];
      for (const event of body.timeline) {
        expect(validTypes).toContain(event.type);
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('data');
      }
    });

    it('timeline ends with call.ended event when call has endedAt', async () => {
      if (!callId) return;

      const { body } = await apiFetch(
        `/api/observability/calls/${callId}/timeline`,
      );
      if (body.endedAt && body.timeline.length > 0) {
        const lastEvent = body.timeline[body.timeline.length - 1];
        expect(lastEvent.type).toBe('call.ended');
      }
    });
  });

  // =========================================================================
  // GET /api/observability/calls/:id/turns
  // =========================================================================
  describe('GET /api/observability/calls/:id/turns', () => {
    it('returns 404 for non-existent call', async () => {
      const { status } = await apiFetch(
        `/api/observability/calls/${NON_EXISTENT_ID}/turns`,
      );
      expect(status).toBe(404);
    });

    it('returns turns array', async () => {
      if (!callId) return;

      const { status, body } = await apiFetch(
        `/api/observability/calls/${callId}/turns`,
      );
      expect(status).toBe(200);
      expect(body).toHaveProperty('turns');
      expect(Array.isArray(body.turns)).toBe(true);
    });

    it('each turn has role and content', async () => {
      if (!callId) return;

      const { body } = await apiFetch(
        `/api/observability/calls/${callId}/turns`,
      );
      if (body.turns.length === 0) return;

      for (const turn of body.turns) {
        expect(turn).toHaveProperty('role');
        expect(turn).toHaveProperty('content');
        expect(['user', 'assistant', 'system']).toContain(turn.role);
        expect(typeof turn.content).toBe('string');
      }
    });

    it('turns have sequential numeric ids', async () => {
      if (!callId) return;

      const { body } = await apiFetch(
        `/api/observability/calls/${callId}/turns`,
      );
      if (body.turns.length === 0) return;

      body.turns.forEach((turn, index) => {
        expect(turn.id).toBe(index);
      });
    });
  });

  // =========================================================================
  // GET /api/observability/calls/:id/observer
  // =========================================================================
  describe('GET /api/observability/calls/:id/observer', () => {
    it('returns 404 for non-existent call', async () => {
      const { status } = await apiFetch(
        `/api/observability/calls/${NON_EXISTENT_ID}/observer`,
      );
      expect(status).toBe(404);
    });

    it('returns observer data with expected shape', async () => {
      if (!callId) return;

      const { status, body } = await apiFetch(
        `/api/observability/calls/${callId}/observer`,
      );
      expect(status).toBe(200);

      // Top-level keys
      expect(body).toHaveProperty('signals');
      expect(body).toHaveProperty('count');
      expect(body).toHaveProperty('summary');
      expect(body).toHaveProperty('analysis');

      expect(Array.isArray(body.signals)).toBe(true);
      expect(typeof body.count).toBe('number');
      expect(body.count).toBe(body.signals.length);
    });

    it('summary has required distribution fields', async () => {
      if (!callId) return;

      const { body } = await apiFetch(
        `/api/observability/calls/${callId}/observer`,
      );

      const summary = body.summary;
      expect(summary).toHaveProperty('averageConfidence');
      expect(summary).toHaveProperty('engagementDistribution');
      expect(summary).toHaveProperty('emotionalStateDistribution');
      expect(summary).toHaveProperty('totalConcerns');
      expect(summary).toHaveProperty('uniqueConcerns');

      expect(typeof summary.averageConfidence).toBe('number');
      expect(typeof summary.totalConcerns).toBe('number');
      expect(Array.isArray(summary.uniqueConcerns)).toBe(true);
    });

    it('signals have proper structure when present', async () => {
      if (!callId) return;

      const { body } = await apiFetch(
        `/api/observability/calls/${callId}/observer`,
      );

      for (const signal of body.signals) {
        expect(signal).toHaveProperty('turnId');
        expect(signal).toHaveProperty('speaker');
        expect(signal).toHaveProperty('turnContent');
        expect(signal).toHaveProperty('signal');

        const sig = signal.signal;
        expect(sig).toHaveProperty('engagementLevel');
        expect(sig).toHaveProperty('emotionalState');
        expect(sig).toHaveProperty('confidenceScore');
        expect(sig).toHaveProperty('concerns');

        expect(['high', 'medium', 'low']).toContain(sig.engagementLevel);
        expect(['positive', 'neutral', 'negative']).toContain(sig.emotionalState);
        expect(sig.confidenceScore).toBeGreaterThanOrEqual(0);
        expect(sig.confidenceScore).toBeLessThanOrEqual(1);
        expect(Array.isArray(sig.concerns)).toBe(true);
      }
    });

    it('analysis is object or null', async () => {
      if (!callId) return;

      const { body } = await apiFetch(
        `/api/observability/calls/${callId}/observer`,
      );

      if (body.analysis !== null) {
        // When present, it should have engagement data
        expect(body.analysis).toHaveProperty('engagementScore');
        expect(body.analysis).toHaveProperty('rapport');
        expect(body.analysis).toHaveProperty('positiveObservations');
        expect(Array.isArray(body.analysis.positiveObservations)).toBe(true);
      }
    });
  });

  // =========================================================================
  // GET /api/observability/calls/:id/metrics
  // =========================================================================
  describe('GET /api/observability/calls/:id/metrics', () => {
    it('returns 404 for non-existent call', async () => {
      const { status } = await apiFetch(
        `/api/observability/calls/${NON_EXISTENT_ID}/metrics`,
      );
      expect(status).toBe(404);
    });

    it('returns metrics envelope with expected shape', async () => {
      if (!callId) return;

      const { status, body } = await apiFetch(
        `/api/observability/calls/${callId}/metrics`,
      );
      expect(status).toBe(200);

      expect(body).toHaveProperty('turnMetrics');
      expect(body).toHaveProperty('callMetrics');
      expect(body).toHaveProperty('durationSeconds');

      expect(Array.isArray(body.turnMetrics)).toBe(true);
    });

    it('callMetrics has expected fields when present', async () => {
      if (!callId) return;

      const { body } = await apiFetch(
        `/api/observability/calls/${callId}/metrics`,
      );

      if (body.callMetrics !== null) {
        const fields = [
          'totalInputTokens',
          'totalOutputTokens',
          'totalTokens',
          'avgResponseTime',
          'avgTtfa',
          'turnCount',
          'estimatedCost',
          'modelsUsed',
        ];
        for (const field of fields) {
          expect(body.callMetrics).toHaveProperty(field);
        }
        expect(typeof body.callMetrics.totalTokens).toBe('number');
        expect(typeof body.callMetrics.turnCount).toBe('number');
        expect(Array.isArray(body.callMetrics.modelsUsed)).toBe(true);

        // Cost should be a non-negative number (or null)
        if (body.callMetrics.estimatedCost !== null) {
          expect(body.callMetrics.estimatedCost).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  // =========================================================================
  // GET /api/observability/metrics/summary
  // =========================================================================
  describe('GET /api/observability/metrics/summary', () => {
    it('returns summary with expected shape', async () => {
      const { status, body } = await apiFetch('/api/observability/metrics/summary');
      expect(status).toBe(200);

      expect(body).toHaveProperty('summary');
      expect(body).toHaveProperty('end_reasons');
      expect(body).toHaveProperty('hours');

      expect(typeof body.summary).toBe('object');
      expect(Array.isArray(body.end_reasons)).toBe(true);
      expect(typeof body.hours).toBe('number');
    });

    it('summary has aggregated metric fields', async () => {
      const { body } = await apiFetch('/api/observability/metrics/summary');

      const s = body.summary;
      // These fields are always present (may be null if no data in the time window)
      expect(s).toHaveProperty('total_calls');
      expect(s).toHaveProperty('successful_calls');
      expect(s).toHaveProperty('avg_duration_seconds');
      expect(s).toHaveProperty('avg_turn_count');
      expect(s).toHaveProperty('avg_llm_ttfb_ms');
      expect(s).toHaveProperty('avg_tts_ttfb_ms');
      expect(s).toHaveProperty('avg_turn_latency_ms');
    });

    it('respects ?hours=N query parameter', async () => {
      const { body: body24 } = await apiFetch('/api/observability/metrics/summary?hours=24');
      const { body: body168 } = await apiFetch('/api/observability/metrics/summary?hours=168');

      expect(body24.hours).toBe(24);
      expect(body168.hours).toBe(168);

      // Wider window should have >= calls than narrower window
      const calls24 = Number(body24.summary.total_calls) || 0;
      const calls168 = Number(body168.summary.total_calls) || 0;
      expect(calls168).toBeGreaterThanOrEqual(calls24);
    });

    it('end_reasons entries have end_reason and count', async () => {
      const { body } = await apiFetch('/api/observability/metrics/summary?hours=168');

      for (const entry of body.end_reasons) {
        expect(entry).toHaveProperty('end_reason');
        expect(entry).toHaveProperty('count');
        expect(typeof entry.count).toBe('number');
      }
    });

    it('clamps hours to valid range (1-168)', async () => {
      // hours=0 should be clamped to 1
      const { body: bodyMin } = await apiFetch('/api/observability/metrics/summary?hours=0');
      expect(bodyMin.hours).toBeGreaterThanOrEqual(1);

      // hours=9999 should be clamped to 168
      const { body: bodyMax } = await apiFetch('/api/observability/metrics/summary?hours=9999');
      expect(bodyMax.hours).toBeLessThanOrEqual(168);
    });
  });

  // =========================================================================
  // GET /api/observability/metrics/latency
  // =========================================================================
  describe('GET /api/observability/metrics/latency', () => {
    it('returns latency trends with expected shape', async () => {
      const { status, body } = await apiFetch('/api/observability/metrics/latency');
      expect(status).toBe(200);

      expect(body).toHaveProperty('latency');
      expect(body).toHaveProperty('hours');
      expect(Array.isArray(body.latency)).toBe(true);
      expect(typeof body.hours).toBe('number');
    });

    it('latency entries have expected metric fields', async () => {
      // Use a wide window to maximise chance of getting data
      const { body } = await apiFetch('/api/observability/metrics/latency?hours=168');

      for (const entry of body.latency) {
        expect(entry).toHaveProperty('hour');
        expect(entry).toHaveProperty('call_count');
        expect(entry).toHaveProperty('llm_ttfb_ms');
        expect(entry).toHaveProperty('tts_ttfb_ms');
        expect(entry).toHaveProperty('turn_latency_ms');
        expect(entry).toHaveProperty('avg_duration');
      }
    });

    it('respects ?hours=N query parameter', async () => {
      const { body: body24 } = await apiFetch('/api/observability/metrics/latency?hours=24');
      const { body: body168 } = await apiFetch('/api/observability/metrics/latency?hours=168');

      expect(body24.hours).toBe(24);
      expect(body168.hours).toBe(168);

      // Wider window should have >= data points
      expect(body168.latency.length).toBeGreaterThanOrEqual(body24.latency.length);
    });

    it('latency entries are ordered by hour ascending', async () => {
      const { body } = await apiFetch('/api/observability/metrics/latency?hours=168');
      if (body.latency.length < 2) return;

      for (let i = 1; i < body.latency.length; i++) {
        const prev = new Date(body.latency[i - 1].hour).getTime();
        const curr = new Date(body.latency[i].hour).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });
  });

  // =========================================================================
  // Cross-cutting: auth enforcement
  // =========================================================================
  describe('Auth enforcement on all endpoints', () => {
    const protectedPaths = [
      '/api/observability/calls',
      '/api/observability/calls/00000000-0000-0000-0000-000000000000',
      '/api/observability/calls/00000000-0000-0000-0000-000000000000/timeline',
      '/api/observability/calls/00000000-0000-0000-0000-000000000000/turns',
      '/api/observability/calls/00000000-0000-0000-0000-000000000000/observer',
      '/api/observability/calls/00000000-0000-0000-0000-000000000000/metrics',
      '/api/observability/metrics/summary',
      '/api/observability/metrics/latency',
    ];

    for (const path of protectedPaths) {
      it(`GET ${path} returns 401 without auth`, async () => {
        const url = `${API_BASE}${path}`;
        const res = await fetch(url);
        expect(res.status).toBe(401);
      });
    }

    it('returns 401 with invalid Bearer token', async () => {
      const url = `${API_BASE}/api/observability/calls`;
      const res = await fetch(url, {
        headers: { Authorization: 'Bearer invalid-garbage-token' },
      });
      expect(res.status).toBe(401);
    });
  });
});

// ---------------------------------------------------------------------------
// Guard: print a clear message when skipped so CI output isn't confusing
// ---------------------------------------------------------------------------
if (!auth) {
  describe('Observability API Integration Tests (SKIPPED)', () => {
    it('skipped — set TEST_AUTH_TOKEN, TEST_JWT_SECRET, or TEST_COFOUNDER_KEY env var to enable', () => {
      console.warn(
        '\n  [SKIP] Observability integration tests require auth credentials.\n' +
          '  Set TEST_AUTH_TOKEN=<jwt>, TEST_JWT_SECRET=<secret>, or TEST_COFOUNDER_KEY=<key> to run them.\n',
      );
    });
  });
}
