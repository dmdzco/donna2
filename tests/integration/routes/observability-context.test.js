import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  const selectWhere = vi.fn();
  const execute = vi.fn();
  const cleanupWhere = vi.fn(() => Promise.resolve({ rowCount: 0 }));
  const decrypt = vi.fn((value) => value);
  const decryptJson = vi.fn((value) => value);
  const logAudit = vi.fn();
  const authToRole = vi.fn(() => 'admin');
  const requireAdmin = vi.fn((req, _res, next) => {
    req.auth = {
      isAdmin: true,
      isCofounder: false,
      userId: 'admin-test',
      provider: 'test',
    };
    next();
  });

  return {
    selectWhere,
    execute,
    cleanupWhere,
    decrypt,
    decryptJson,
    logAudit,
    authToRole,
    requireAdmin,
  };
});

vi.mock('../../../db/client.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: harness.selectWhere,
      })),
    })),
    execute: harness.execute,
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: harness.cleanupWhere,
      })),
    })),
  },
}));

vi.mock('../../../middleware/auth.js', () => ({
  requireAdmin: harness.requireAdmin,
}));

vi.mock('../../../lib/encryption.js', () => ({
  decrypt: harness.decrypt,
  decryptJson: harness.decryptJson,
}));

vi.mock('../../../services/call-analyses.js', () => ({
  callAnalysisService: {
    getLatestByConversationIds: vi.fn(),
  },
}));

vi.mock('../../../services/audit.js', () => ({
  logAudit: harness.logAudit,
  authToRole: harness.authToRole,
}));

import observabilityRouter from '../../../routes/observability.js';

function makeCallRow() {
  return {
    id: 'call-1',
    callSid: 'CA1234567890',
    durationSeconds: 600,
    status: 'completed',
  };
}

function makeLatencyJson() {
  return JSON.stringify({
    llm_ttfb_avg_ms: 420,
    turn_avg_ms: 1180,
    stage_breakdown: {
      'call.answer_to_ws': {
        count: 1,
        avg_ms: 1200,
        p95_ms: 1200,
        max_ms: 1200,
        last_ms: 1200,
      },
      'tool.web_search': {
        count: 1,
        avg_ms: 640,
        p95_ms: 640,
        max_ms: 640,
        last_ms: 640,
      },
    },
  });
}

async function requestJson(pathname) {
  const app = express();
  app.use(observabilityRouter);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
    const body = await response.json();
    return { status: response.status, body };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('observability context route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.cleanupWhere.mockResolvedValue({ rowCount: 0 });
    harness.selectWhere.mockResolvedValue([makeCallRow()]);
    harness.decrypt.mockImplementation((value) => value);
    harness.decryptJson.mockImplementation((value) => value);
  });

  it('returns persisted stage breakdown when encrypted context trace is absent', async () => {
    harness.execute.mockResolvedValue({
      rows: [
        {
          call_sid: 'CA1234567890',
          latency: makeLatencyJson(),
          tools_used: ['web_search'],
          context_trace_encrypted: null,
        },
      ],
    });

    const response = await requestJson('/api/observability/calls/call-1/context');

    expect(response.status).toBe(200);
    expect(response.body.contextTrace.event_count).toBe(0);
    expect(response.body.contextTrace.events).toEqual([]);
    expect(response.body.contextTrace.latency_breakdown['call.answer_to_ws'].avg_ms).toBe(1200);
    expect(response.body.latency.stage_breakdown['tool.web_search'].max_ms).toBe(640);
    expect(response.body.toolsUsed).toEqual(['web_search']);
    expect(response.body.captured).toBe(true);
    expect(response.body.schemaReady).toBe(true);
    expect(harness.decryptJson).not.toHaveBeenCalled();
  });

  it('falls back to persisted latency when the context_trace_encrypted column is unavailable', async () => {
    const missingColumnError = new Error('column context_trace_encrypted does not exist');
    missingColumnError.code = '42703';

    harness.execute
      .mockRejectedValueOnce(missingColumnError)
      .mockResolvedValueOnce({
        rows: [
          {
            call_sid: 'CA1234567890',
            latency: makeLatencyJson(),
            tools_used: [],
          },
        ],
      });

    const response = await requestJson('/api/observability/calls/call-1/context');

    expect(response.status).toBe(200);
    expect(response.body.contextTrace.latency_breakdown['call.answer_to_ws'].avg_ms).toBe(1200);
    expect(response.body.contextTrace.events).toEqual([]);
    expect(response.body.captured).toBe(true);
    expect(response.body.schemaReady).toBe(false);
    expect(harness.execute).toHaveBeenCalledTimes(2);
  });

  it('prefers persisted stage breakdown when decrypted trace carries an empty breakdown', async () => {
    harness.execute.mockResolvedValue({
      rows: [
        {
          call_sid: 'CA1234567890',
          latency: makeLatencyJson(),
          tools_used: ['web_search'],
          context_trace_encrypted: 'ciphertext',
        },
      ],
    });
    harness.decryptJson.mockReturnValue({
      version: 1,
      captured_at: '2026-03-08T14:10:05Z',
      event_count: 0,
      latency_breakdown: {},
      events: [],
    });

    const response = await requestJson('/api/observability/calls/call-1/context');

    expect(response.status).toBe(200);
    expect(response.body.contextTrace.captured_at).toBe('2026-03-08T14:10:05Z');
    expect(response.body.contextTrace.latency_breakdown['call.answer_to_ws'].avg_ms).toBe(1200);
    expect(response.body.captured).toBe(true);
    expect(response.body.schemaReady).toBe(true);
    expect(harness.decryptJson).toHaveBeenCalledWith('ciphertext');
  });
});
