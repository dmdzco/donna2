import { db } from '../db/client.js';
import { caregivers, seniors } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export const caregiverService = {
  // Link a Clerk user to a senior (creates caregiver assignment, skips if already linked)
  async linkUserToSenior(clerkUserId, seniorId, role = 'caregiver') {
    // Check if already linked
    const existing = await this.getAssignment(clerkUserId, seniorId);
    if (existing) {
      console.log(`[Caregiver] User ${clerkUserId} already linked to senior ${seniorId}, skipping`);
      return existing;
    }

    const [assignment] = await db.insert(caregivers).values({
      clerkUserId,
      seniorId,
      role,
    }).returning();

    console.log(`[Caregiver] Linked user ${clerkUserId} to senior ${seniorId} as ${role}`);
    return assignment;
  },

  // Get all seniors accessible by a Clerk user
  async getSeniorsForUser(clerkUserId) {
    const assignments = await db.select({
      assignment: caregivers,
      senior: seniors,
    })
      .from(caregivers)
      .innerJoin(seniors, eq(caregivers.seniorId, seniors.id))
      .where(and(
        eq(caregivers.clerkUserId, clerkUserId),
        eq(seniors.isActive, true)
      ));

    return assignments.map(a => ({
      ...a.senior,
      role: a.assignment.role,
    }));
  },

  // Check if a Clerk user can access a senior
  async canAccessSenior(clerkUserId, seniorId) {
    const [assignment] = await db.select()
      .from(caregivers)
      .where(and(
        eq(caregivers.clerkUserId, clerkUserId),
        eq(caregivers.seniorId, seniorId)
      ))
      .limit(1);
    return !!assignment;
  },

  // Get all Clerk users who can access a senior
  async getUsersForSenior(seniorId) {
    const assignments = await db.select()
      .from(caregivers)
      .where(eq(caregivers.seniorId, seniorId));

    return assignments.map(a => ({
      clerkUserId: a.clerkUserId,
      role: a.role,
    }));
  },

  // Remove a user's access to a senior
  async unlinkUserFromSenior(clerkUserId, seniorId) {
    const result = await db.delete(caregivers)
      .where(and(
        eq(caregivers.clerkUserId, clerkUserId),
        eq(caregivers.seniorId, seniorId)
      ))
      .returning();

    return result.length > 0;
  },

  // Get assignment details
  async getAssignment(clerkUserId, seniorId) {
    const [assignment] = await db.select()
      .from(caregivers)
      .where(and(
        eq(caregivers.clerkUserId, clerkUserId),
        eq(caregivers.seniorId, seniorId)
      ));
    return assignment || null;
  },
};
