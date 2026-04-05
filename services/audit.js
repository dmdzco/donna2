/**
 * HIPAA Audit Logging Service
 *
 * Logs all access to Protected Health Information (PHI) for compliance.
 * All writes are fire-and-forget — they never block the request path.
 */

import { db } from '../db/client.js';
import { auditLogs } from '../db/schema.js';

/**
 * Insert an audit log row. Fire-and-forget — never await this in route handlers.
 *
 * @param {Object} params
 * @param {string} params.userId - admin ID, clerk user ID, or 'cofounder'
 * @param {string} params.userRole - 'admin', 'caregiver', 'cofounder', or 'unknown'
 * @param {string} params.action - 'read', 'create', 'update', 'delete', 'auth_failure'
 * @param {string} params.resourceType - 'senior', 'conversation', 'memory', 'reminder', 'call_analysis', 'auth'
 * @param {string|null} [params.resourceId] - UUID of the accessed resource (nullable for list endpoints)
 * @param {string|null} [params.ipAddress]
 * @param {string|null} [params.userAgent]
 * @param {Object|null} [params.metadata] - extra context (e.g., query params, filters)
 */
export function logAudit({ userId, userRole, action, resourceType, resourceId = null, ipAddress = null, userAgent = null, metadata = null }) {
  // Fire-and-forget: don't await, don't block
  db.insert(auditLogs).values({
    userId,
    userRole,
    action,
    resourceType,
    resourceId,
    ipAddress,
    userAgent,
    metadata: metadata || {},
  }).then(() => {}).catch((err) => {
    console.error('[Audit] Log insert failed:', err.message);
  });
}

/**
 * Derive a role string from a req.auth object.
 *
 * @param {Object} auth - req.auth from middleware
 * @returns {string} 'cofounder', 'admin', or 'caregiver'
 */
export function authToRole(auth) {
  if (auth?.isCofounder) return 'cofounder';
  if (auth?.isAdmin) return 'admin';
  return 'caregiver';
}
