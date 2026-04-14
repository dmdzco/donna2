import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'services', 'data-retention.js'),
  'utf8',
);

describe('data retention purge SQL', () => {
  it('uses a Postgres-compatible batch CTE instead of DELETE LIMIT', () => {
    expect(source).toContain('WITH batch AS');
    expect(source).toContain('USING batch');
    expect(source).toContain('WHERE target.ctid = batch.ctid');
    expect(source).not.toMatch(/DELETE FROM \$\{sql\.raw\(table\)\}\s+WHERE[\s\S]*LIMIT/);
  });

  it('defaults audit log retention to six years', () => {
    expect(source).toContain("RETENTION_AUDIT_LOGS_DAYS                 || '2190'");
  });

  it('redacts conversation PHI before deleting metadata', () => {
    expect(source).toContain('conversation_phi');
    expect(source).toContain('RETENTION_CONVERSATION_METADATA_DAYS');
    expect(source).toContain('summary = NULL');
    expect(source).toContain('transcript_encrypted = NULL');
  });
});
