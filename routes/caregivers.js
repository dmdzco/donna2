import { Router } from 'express';
import { clerkClient } from '@clerk/express';
import { caregiverService } from '../services/caregivers.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { db } from '../db/client.js';
import { caregivers, seniors, notificationPreferences, notifications } from '../db/schema.js';
import { eq, desc, inArray, sql } from 'drizzle-orm';
import { seniorService } from '../services/seniors.js';
import { routeError } from './helpers.js';
import { logAudit, authToRole } from '../services/audit.js';

const router = Router();

// List all caregiver-senior links (admin only)
router.get('/api/caregivers', requireAdmin, async (req, res) => {
  try {
    const links = await db.select({
      id: caregivers.id,
      clerkUserId: caregivers.clerkUserId,
      seniorId: caregivers.seniorId,
      seniorName: seniors.name,
      role: caregivers.role,
      createdAt: caregivers.createdAt,
    })
    .from(caregivers)
    .leftJoin(seniors, eq(caregivers.seniorId, seniors.id))
    .orderBy(desc(caregivers.createdAt));

    res.json(links);
  } catch (error) {
    routeError(res, error, 'GET /api/caregivers');
  }
});

// Get current user's seniors (uses Clerk user ID directly)
router.get('/api/caregivers/me', requireAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;

    // Get all seniors this user can access
    const seniors = await caregiverService.getSeniorsForUser(clerkUserId);

    if (seniors.length === 0) {
      // No seniors linked - they need to complete onboarding
      return res.status(404).json({ error: 'No seniors found', needsOnboarding: true });
    }

    res.json({
      clerkUserId,
      seniors,
    });
  } catch (error) {
    routeError(res, error, 'GET /api/caregivers/me');
  }
});

// Delete current caregiver account and associated Donna data.
router.delete('/api/caregivers/me/account', requireAuth, writeLimiter, async (req, res) => {
  try {
    if (req.auth.provider !== 'clerk') {
      return res.status(400).json({ error: 'Clerk authentication required for account deletion' });
    }

    const clerkUserId = req.auth.userId;
    const assignments = await db.select()
      .from(caregivers)
      .where(eq(caregivers.clerkUserId, clerkUserId));

    const assignmentsBySenior = new Map();
    for (const assignment of assignments) {
      const current = assignmentsBySenior.get(assignment.seniorId) ?? [];
      current.push(assignment);
      assignmentsBySenior.set(assignment.seniorId, current);
    }

    const deletedSeniors = [];
    const unlinkedSeniors = [];
    const deletionCounts = {};

    for (const [seniorId, seniorAssignments] of assignmentsBySenior.entries()) {
      const otherCaregiverResult = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM caregivers
        WHERE senior_id = ${seniorId}
          AND clerk_user_id <> ${clerkUserId}
      `);
      const otherCaregiverCount = Number(otherCaregiverResult.rows?.[0]?.count ?? 0);

      if (otherCaregiverCount === 0) {
        deletionCounts[seniorId] = await seniorService.hardDelete(
          seniorId,
          clerkUserId,
          'caregiver_account_deletion',
        );
        deletedSeniors.push(seniorId);
        continue;
      }

      const assignmentIds = seniorAssignments.map((assignment) => assignment.id);
      const unlinkCounts = await db.transaction(async (tx) => {
        const deletedPreferences = await tx.delete(notificationPreferences)
          .where(inArray(notificationPreferences.caregiverId, assignmentIds))
          .returning({ id: notificationPreferences.id });
        const deletedNotifications = await tx.delete(notifications)
          .where(inArray(notifications.caregiverId, assignmentIds))
          .returning({ id: notifications.id });
        const deletedCaregivers = await tx.delete(caregivers)
          .where(inArray(caregivers.id, assignmentIds))
          .returning({ id: caregivers.id });

        return {
          notification_preferences: deletedPreferences.length,
          notifications: deletedNotifications.length,
          caregivers: deletedCaregivers.length,
        };
      });

      deletionCounts[seniorId] = unlinkCounts;
      unlinkedSeniors.push(seniorId);
    }

    logAudit({
      userId: clerkUserId,
      userRole: authToRole(req.auth),
      action: 'delete',
      resourceType: 'caregiver_account',
      resourceId: clerkUserId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        deleted_senior_count: deletedSeniors.length,
        unlinked_senior_count: unlinkedSeniors.length,
      },
    });

    let clerkUserDeleted = false;
    try {
      await clerkClient.users.deleteUser(clerkUserId);
      clerkUserDeleted = true;
    } catch (error) {
      logAudit({
        userId: clerkUserId,
        userRole: authToRole(req.auth),
        action: 'delete_clerk_user_failed',
        resourceType: 'caregiver_account',
        resourceId: clerkUserId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        metadata: { error: error.message },
      });

      return res.status(202).json({
        success: true,
        clerkUserDeleted,
        deletedSeniors,
        unlinkedSeniors,
        deletionCounts,
        message: 'Donna data was deleted. Contact support to finish deleting the sign-in account.',
      });
    }

    res.json({
      success: true,
      clerkUserDeleted,
      deletedSeniors,
      unlinkedSeniors,
      deletionCounts,
    });
  } catch (error) {
    routeError(res, error, 'DELETE /api/caregivers/me/account');
  }
});

export default router;
