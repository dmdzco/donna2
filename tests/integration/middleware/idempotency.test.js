import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (...parts) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

const middlewareSource = read('middleware', 'idempotency.js');
const schemaSource = read('db', 'schema.js');
const migrationSource = read('db', 'migrations', '002_idempotency_keys.sql');
const retentionSource = read('services', 'data-retention.js');
const mobileApiSource = read('apps', 'mobile', 'src', 'lib', 'api.ts');

describe('idempotency replay cache', () => {
  it('defines encrypted-only response storage in schema and migration', () => {
    expect(schemaSource).toContain("pgTable('idempotency_keys'");
    expect(schemaSource).toContain('responseEncrypted');
    expect(schemaSource).toContain("text('response_encrypted')");
    expect(schemaSource).toContain('pathHash');
    expect(schemaSource).not.toContain('responseJson');

    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS idempotency_keys');
    expect(migrationSource).toContain('response_encrypted text');
    expect(migrationSource).toContain('path_hash varchar(64)');
    expect(migrationSource).not.toContain('path text');
    expect(migrationSource).not.toContain('response_json');
  });

  it('encrypts cached responses and decrypts only for authorized replay', () => {
    expect(middlewareSource).toContain("import { decryptJson, encryptJson } from '../lib/encryption.js'");
    expect(middlewareSource).toContain('encryptJson({ body: body ?? null })');
    expect(middlewareSource).toContain('decryptJson(existing.responseEncrypted)');
    expect(middlewareSource).toContain("startsWith('enc:')");
    expect(middlewareSource).toContain('db.delete(idempotencyKeys)');
    expect(middlewareSource).not.toContain('JSON.stringify(body)');
  });

  it('binds replay to user, method, path, and hashed body', () => {
    expect(middlewareSource).toContain('existing.userId === userId');
    expect(middlewareSource).toContain('existing.method === method');
    expect(middlewareSource).toContain('existing.pathHash === pathHash');
    expect(middlewareSource).toContain('existing.bodyHash === bodyHash');
    expect(middlewareSource).toContain('createHmac');
    expect(middlewareSource).toContain('IDEMPOTENCY_HASH_KEY');
    expect(middlewareSource).toContain('hashRequestPath');
    expect(middlewareSource).toContain('canonicalStringify');
    expect(middlewareSource).toContain("code: 'idempotency_key_reused'");
    expect(middlewareSource).toContain("code: 'request_processing'");
  });

  it('replays completed matching requests and clears failed writes', () => {
    expect(middlewareSource).toContain("existing.state === 'completed'");
    expect(middlewareSource).toContain("res.setHeader('Idempotency-Status', 'replayed')");
    expect(middlewareSource).toContain('clearRecord(key, getRequestId(req))');
  });

  it('cleans up expired replay entries through data retention', () => {
    expect(retentionSource).toContain('idempotency_keys');
    expect(retentionSource).toContain('purgeExpiredIdempotencyKeys');
    expect(retentionSource).toContain('WHERE expires_at < NOW()');
    expect(retentionSource).toContain('RETENTION_IDEMPOTENCY_KEYS_DAYS');
  });

  it('is wired into user-facing write routes that mobile can retry', () => {
    for (const route of [
      'routes/onboarding.js',
      'routes/reminders.js',
      'routes/seniors.js',
      'routes/calls.js',
      'routes/caregivers.js',
      'routes/notifications.js',
      'routes/memories.js',
    ]) {
      const source = read(route);
      expect(source).toContain('idempotencyMiddleware');
    }
  });

  it('sends stable idempotency keys from mobile write hooks', () => {
    expect(mobileApiSource).toContain('"Idempotency-Key": idempotencyKey');
    expect(mobileApiSource).toContain('"X-Request-Id": requestId');
    expect(mobileApiSource).toContain('createIdempotencyKey');

    for (const file of [
      'apps/mobile/app/(onboarding)/success.tsx',
      'apps/mobile/app/(tabs)/settings.tsx',
      'apps/mobile/src/hooks/useReminders.ts',
      'apps/mobile/src/hooks/useSenior.ts',
      'apps/mobile/src/hooks/useConversations.ts',
      'apps/mobile/src/hooks/useNotifications.ts',
    ]) {
      const source = read(file);
      expect(source).toContain('useStableIdempotencyKey');
      expect(source).toContain('idempotencyKey');
    }
  });

  it('keeps encrypted-field guidance in repo-local skills', () => {
    const privacySkill = read('.codex', 'skills', 'privacy-audit', 'SKILL.md');
    const pipecatSkill = read('.codex', 'skills', 'donna-pipecat-debug', 'SKILL.md');

    expect(privacySkill).toContain('Encrypted-field invariants');
    expect(privacySkill).toContain('replay/idempotency caches');
    expect(pipecatSkill).toContain('encrypted-only PHI writes');
    expect(pipecatSkill).toContain('exports must decrypt');
  });
});
