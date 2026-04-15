import { createHash, createHmac } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { idempotencyKeys } from '../db/schema.js';
import { decryptJson, encryptJson } from '../lib/encryption.js';
import { createLogger } from '../lib/logger.js';
import { getRequestId, sendError } from '../lib/http-response.js';

const log = createLogger('Idempotency');
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENT_METHODS = new Set(['POST', 'PATCH', 'DELETE']);
const SAFE_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,255}$/;

export async function idempotencyMiddleware(req, res, next) {
  if (!IDEMPOTENT_METHODS.has(req.method)) return next();

  const key = getIdempotencyKey(req);
  if (!key) return next();

  if (!SAFE_KEY_PATTERN.test(key)) {
    return sendError(res, 400, {
      error: 'Invalid idempotency key',
      code: 'invalid_idempotency_key',
    });
  }

  const userId = req.auth?.userId;
  if (!userId) return next();

  const method = req.method;
  const path = `${req.baseUrl || ''}${req.path || ''}`;
  const bodyHash = hashRequestBody(req.body);
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);

  try {
    const [inserted] = await db.insert(idempotencyKeys)
      .values({
        key,
        userId,
        method,
        path,
        bodyHash,
        state: 'processing',
        requestId: getRequestId(req),
        expiresAt,
      })
      .onConflictDoNothing()
      .returning({ key: idempotencyKeys.key });

    if (inserted) {
      captureResponseForKey(res, key);
      return next();
    }

    const [existing] = await db.select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key))
      .limit(1);

    if (!existing) {
      await db.insert(idempotencyKeys)
        .values({
          key,
          userId,
          method,
          path,
          bodyHash,
          state: 'processing',
          requestId: getRequestId(req),
          expiresAt,
        })
        .onConflictDoNothing();
      captureResponseForKey(res, key);
      return next();
    }

    if (isExpired(existing.expiresAt)) {
      await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      await db.insert(idempotencyKeys)
        .values({
          key,
          userId,
          method,
          path,
          bodyHash,
          state: 'processing',
          requestId: getRequestId(req),
          expiresAt,
        })
        .onConflictDoNothing();
      captureResponseForKey(res, key);
      return next();
    }

    if (
      existing.userId !== userId ||
      existing.method !== method ||
      existing.path !== path ||
      existing.bodyHash !== bodyHash
    ) {
      return sendError(res, 409, {
        error: 'Idempotency key was reused for a different request',
        code: 'idempotency_key_reused',
      });
    }

    if (existing.state === 'completed' && existing.responseEncrypted) {
      const cachedBody = decryptJson(existing.responseEncrypted);
      if (cachedBody == null) {
        return sendError(res, 409, {
          error: 'This request could not be replayed',
          code: 'idempotency_replay_unavailable',
        });
      }

      res.setHeader('Idempotency-Status', 'replayed');
      if (existing.requestId) {
        res.setHeader('X-Original-Request-Id', existing.requestId);
      }
      return res.status(existing.statusCode || 200).json(cachedBody);
    }

    return sendError(res, 409, {
      error: 'Request is still processing',
      code: 'request_processing',
      originalRequestId: existing.requestId,
    });
  } catch (error) {
    if (isMissingStorage(error)) {
      log.warn('idempotency storage unavailable; continuing without replay protection', {
        requestId: getRequestId(req),
        errorCode: error?.code,
      });
      return next();
    }

    log.error('idempotency check failed', {
      requestId: getRequestId(req),
      errorCode: error?.code,
    });
    return sendError(res, 503, {
      error: 'Request replay protection is unavailable',
      code: 'idempotency_unavailable',
    });
  }
}

function captureResponseForKey(res, key) {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      void cacheSuccessfulResponse(key, res.statusCode, body, getRequestId(res));
    } else {
      void clearKey(key, getRequestId(res));
    }

    return originalJson(body);
  };
}

async function cacheSuccessfulResponse(key, statusCode, body, requestId) {
  try {
    await db.update(idempotencyKeys)
      .set({
        state: 'completed',
        statusCode,
        responseEncrypted: encryptJson(body ?? null),
        requestId,
      })
      .where(eq(idempotencyKeys.key, key));
  } catch (error) {
    log.error('failed to cache idempotent response', {
      requestId,
      errorCode: error?.code,
    });
    await clearKey(key, requestId);
  }
}

async function clearKey(key, requestId) {
  try {
    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
  } catch (error) {
    log.warn('failed to clear idempotency key', {
      requestId,
      errorCode: error?.code,
    });
  }
}

function getIdempotencyKey(req) {
  const header = req.headers['idempotency-key'];
  return Array.isArray(header) ? header[0] : header;
}

function hashRequestBody(body) {
  const canonicalBody = canonicalStringify(body ?? {});
  const secret = process.env.IDEMPOTENCY_HASH_KEY || process.env.FIELD_ENCRYPTION_KEY;

  if (secret) {
    return createHmac('sha256', secret).update(canonicalBody).digest('hex');
  }

  return createHash('sha256').update(canonicalBody).digest('hex');
}

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

function isExpired(expiresAt) {
  return new Date(expiresAt).getTime() <= Date.now();
}

function isMissingStorage(error) {
  const message = String(error?.message || '');
  return error?.code === '42P01' ||
    (/idempotency_keys/i.test(message) && /does not exist|relation/i.test(message));
}
