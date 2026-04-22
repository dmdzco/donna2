import { createHash } from 'crypto';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from '../../helpers/http.js';

const harness = vi.hoisted(() => {
  const execute = vi.fn();
  const selectLimit = vi.fn();
  const updateWhere = vi.fn();
  const deleteWhere = vi.fn();
  const encryptJson = vi.fn((value) => `enc:${JSON.stringify(value)}`);
  const decryptJson = vi.fn((value) => JSON.parse(String(value).replace(/^enc:/, '')));

  return {
    execute,
    selectLimit,
    updateWhere,
    deleteWhere,
    encryptJson,
    decryptJson,
  };
});

vi.mock('../../../db/client.js', () => ({
  db: {
    execute: harness.execute,
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: harness.selectLimit,
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: harness.updateWhere,
      })),
    })),
    delete: vi.fn(() => ({
      where: harness.deleteWhere,
    })),
  },
}));

vi.mock('../../../lib/encryption.js', () => ({
  encryptJson: harness.encryptJson,
  decryptJson: harness.decryptJson,
}));

import { idempotencyMiddleware } from '../../../middleware/idempotency.js';

const originalEnv = { ...process.env };
const IDEMPOTENCY_KEY = 'valid-idempotency-key-123';

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
    .join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function makeExistingRecord(overrides = {}) {
  return {
    key: IDEMPOTENCY_KEY,
    userId: 'caregiver-test',
    method: 'POST',
    pathHash: sha256('/target'),
    bodyHash: sha256(canonicalStringify({ a: 1, b: 2 })),
    state: 'completed',
    statusCode: 202,
    responseEncrypted: 'enc:{"body":{"cached":true}}',
    requestId: 'original-request',
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

function makeRouter(handler) {
  const router = express.Router();
  router.post('/target', (req, _res, next) => {
    req.id = 'request-test';
    req.auth = { userId: 'caregiver-test' };
    next();
  }, idempotencyMiddleware, handler);
  return router;
}

async function postTarget({ body = { a: 1, b: 2 }, key = IDEMPOTENCY_KEY, handler }) {
  return requestJson(makeRouter(handler), {
    method: 'POST',
    path: '/target',
    body,
    headers: key ? { 'idempotency-key': key } : {},
  });
}

describe('idempotency middleware runtime behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      IDEMPOTENCY_HASH_KEY: '',
      FIELD_ENCRYPTION_KEY: '',
    };
    harness.execute.mockResolvedValue({ rows: [{ key: IDEMPOTENCY_KEY }] });
    harness.selectLimit.mockResolvedValue([]);
    harness.updateWhere.mockResolvedValue({ rowCount: 1 });
    harness.deleteWhere.mockResolvedValue({ rowCount: 1 });
    harness.encryptJson.mockImplementation((value) => `enc:${JSON.stringify(value)}`);
    harness.decryptJson.mockImplementation((value) => JSON.parse(String(value).replace(/^enc:/, '')));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('claims a new key, runs the handler, and stores the successful JSON response', async () => {
    const handler = vi.fn((_req, res) => res.status(201).json({ ok: true }));

    const response = await postTarget({ handler });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(harness.encryptJson).toHaveBeenCalledWith({ body: { ok: true } });
    expect(harness.updateWhere).toHaveBeenCalledTimes(1);
  });

  it('replays a completed matching response without running the handler again', async () => {
    harness.execute.mockResolvedValue({ rows: [] });
    harness.selectLimit.mockResolvedValue([makeExistingRecord()]);
    const handler = vi.fn((_req, res) => res.json({ shouldNotRun: true }));

    const response = await postTarget({ handler });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ cached: true });
    expect(response.headers.get('idempotency-status')).toBe('replayed');
    expect(response.headers.get('x-original-request-id')).toBe('original-request');
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects the same key reused with a different request body', async () => {
    harness.execute.mockResolvedValue({ rows: [] });
    harness.selectLimit.mockResolvedValue([
      makeExistingRecord({ bodyHash: sha256(canonicalStringify({ different: true })) }),
    ]);
    const handler = vi.fn((_req, res) => res.json({ shouldNotRun: true }));

    const response = await postTarget({ handler });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: 'Idempotency conflict',
      code: 'idempotency_key_reused',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('continues without replay protection when the storage table is not ready', async () => {
    const storageError = new Error('relation idempotency_keys does not exist');
    storageError.code = '42P01';
    harness.execute.mockRejectedValue(storageError);
    const handler = vi.fn((_req, res) => res.json({ ok: true }));

    const response = await postTarget({ handler });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed keys before hitting storage or the handler', async () => {
    const handler = vi.fn((_req, res) => res.json({ shouldNotRun: true }));

    const response = await postTarget({ key: 'short', handler });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'Invalid Idempotency-Key',
      code: 'invalid_idempotency_key',
    });
    expect(harness.execute).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});
