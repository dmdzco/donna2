/**
 * Token Revocation Service
 *
 * Database-backed JWT token revocation for HIPAA-compliant session management.
 * Stores SHA-256 hashes of revoked tokens (never the raw tokens).
 */

import { createHash } from 'crypto';
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export const tokenRevocationService = {
  /**
   * Revoke a specific JWT token.
   * Stores the hash with a 7-day expiry (matching JWT max lifetime).
   */
  async revokeToken(token, revokedBy, reason = '') {
    const tokenHash = hashToken(token);
    await db.execute(sql`
      INSERT INTO revoked_tokens (token_hash, revoked_by, reason, expires_at)
      VALUES (${tokenHash}, ${revokedBy}, ${reason}, NOW() + INTERVAL '7 days')
      ON CONFLICT (token_hash) DO NOTHING
    `);
  },

  /**
   * Revoke all tokens for a given admin (bulk revocation).
   * Stores a marker row keyed by admin ID.
   */
  async revokeAllForAdmin(adminId, revokedBy, reason = '') {
    const markerHash = createHash('sha256').update(`revoke_all:${adminId}`).digest('hex');
    await db.execute(sql`
      INSERT INTO revoked_tokens (token_hash, revoked_by, reason, expires_at)
      VALUES (${markerHash}, ${revokedBy}, ${reason || `revoke_all for admin ${adminId}`}, NOW() + INTERVAL '7 days')
      ON CONFLICT (token_hash) DO UPDATE SET
        revoked_at = NOW(),
        revoked_by = EXCLUDED.revoked_by,
        reason = EXCLUDED.reason,
        expires_at = EXCLUDED.expires_at
    `);
  },

  /**
   * Check if a specific token has been revoked. Fast indexed lookup.
   */
  async isTokenRevoked(token) {
    const tokenHash = hashToken(token);
    const result = await db.execute(sql`
      SELECT 1 FROM revoked_tokens
      WHERE token_hash = ${tokenHash} AND expires_at > NOW()
    `);
    return result.rows.length > 0;
  },

  /**
   * Check if all tokens for an admin have been bulk-revoked.
   */
  async isAdminRevoked(adminId) {
    const markerHash = createHash('sha256').update(`revoke_all:${adminId}`).digest('hex');
    const result = await db.execute(sql`
      SELECT 1 FROM revoked_tokens
      WHERE token_hash = ${markerHash} AND expires_at > NOW()
    `);
    return result.rows.length > 0;
  },

  /**
   * Remove expired revocation entries. Returns count deleted.
   */
  async cleanupExpired() {
    const result = await db.execute(sql`
      WITH d AS (DELETE FROM revoked_tokens WHERE expires_at < NOW() RETURNING 1)
      SELECT count(*) AS c FROM d
    `);
    return parseInt(result.rows[0]?.c || '0', 10);
  },
};
