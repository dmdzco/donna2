/**
 * Shared route helpers
 *
 * Auth helpers used across multiple route files.
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
