/**
 * Shared route helpers
 *
 * Auth helpers and error handling used across all route files.
 */

import { db } from '../db/client.js';
import { caregivers } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Get senior IDs accessible by a user.
 * Returns null for admins (meaning all seniors).
 */
export async function getAccessibleSeniorIds(auth) {
  if (auth.isAdmin) return null;
  const assignments = await db.select({ seniorId: caregivers.seniorId })
    .from(caregivers)
    .where(eq(caregivers.clerkUserId, auth.userId));
  return assignments.map(a => a.seniorId);
}

/**
 * Check if user can access a specific senior.
 */
export async function canAccessSenior(auth, seniorId) {
  if (auth.isAdmin) return true;
  const [assignment] = await db.select()
    .from(caregivers)
    .where(and(
      eq(caregivers.clerkUserId, auth.userId),
      eq(caregivers.seniorId, seniorId)
    ))
    .limit(1);
  return !!assignment;
}

/**
 * Log a route error and send a 500 response.
 * Ensures every unhandled route error is visible in Railway logs.
 *
 * @param {import('express').Response} res
 * @param {Error} error
 * @param {string} context - e.g. "POST /api/reminders"
 */
export function routeError(res, error, context) {
  console.error(`[${context}]`, error);
  res.status(500).json({ error: error.message });
}
