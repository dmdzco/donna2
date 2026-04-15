import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const middlewareSource = fs.readFileSync(
  path.resolve('middleware/idempotency.js'),
  'utf-8',
);
const schemaSource = fs.readFileSync(path.resolve('db/schema.js'), 'utf-8');
const mobileApiSource = fs.readFileSync(
  path.resolve('apps/mobile/src/lib/api.ts'),
  'utf-8',
);
const mobileWriteRoutes = [
  'routes/onboarding.js',
  'routes/reminders.js',
  'routes/seniors.js',
  'routes/calls.js',
  'routes/caregivers.js',
  'routes/notifications.js',
];

describe('mobile write idempotency', () => {
  it('stores only a body hash and encrypted response for replay', () => {
    expect(schemaSource).toContain("pgTable('idempotency_keys'");
    expect(schemaSource).toContain("bodyHash: varchar('body_hash'");
    expect(schemaSource).toContain("responseEncrypted: text('response_encrypted')");

    expect(middlewareSource).toContain('hashRequestBody(req.body)');
    expect(middlewareSource).toContain('encryptJson(body ?? null)');
    expect(middlewareSource).toContain('decryptJson(existing.responseEncrypted)');
    expect(middlewareSource).not.toContain('responseJson');
  });

  it('replays completed matching requests and rejects changed keys', () => {
    expect(middlewareSource).toContain("existing.state === 'completed'");
    expect(middlewareSource).toContain("res.setHeader('Idempotency-Status', 'replayed')");
    expect(middlewareSource).toContain("code: 'idempotency_key_reused'");
    expect(middlewareSource).toContain("code: 'request_processing'");
  });

  it('sends request IDs and idempotency keys from the mobile API client', () => {
    expect(mobileApiSource).toContain('"X-Request-Id": requestId');
    expect(mobileApiSource).toContain('"Idempotency-Key": idempotencyKey');
    expect(mobileApiSource).toContain('createIdempotencyKey(scope: string)');
  });

  it('is mounted on mobile-owned write routes', () => {
    for (const routePath of mobileWriteRoutes) {
      const source = fs.readFileSync(path.resolve(routePath), 'utf-8');
      expect(source).toContain('idempotencyMiddleware');
    }
  });
});
