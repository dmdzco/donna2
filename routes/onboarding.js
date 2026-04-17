import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { caregivers, reminders, seniors } from '../db/schema.js';
import { seniorService } from '../services/seniors.js';
import { caregiverService } from '../services/caregivers.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import { onboardingSchema } from '../validators/schemas.js';
import { maskName } from '../lib/sanitize.js';
import { cronExpressionFromTime, resolveTimezoneFromProfile, wallTimeTodayToUtcDate } from '../lib/timezone.js';

const router = Router();

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

// Complete onboarding - creates senior + links to Clerk user + creates reminders
router.post('/api/onboarding', requireAuth, writeLimiter, validateBody(onboardingSchema), async (req, res) => {
  try {
    const { senior: seniorData, relation, interests, additionalInfo, reminders: reminderStrings, topicsToAvoid, callSchedule } = req.body;

    // Get Clerk user ID from auth
    const clerkUserId = req.auth.userId;
    if (!clerkUserId || clerkUserId === 'cofounder') {
      return res.status(400).json({ error: 'Clerk authentication required for onboarding' });
    }

    // Get familyInfo from request body (contains interestDetails from frontend)
    const { familyInfo: clientFamilyInfo } = req.body;

    // Prepare senior data with structured info in JSON fields
    const seniorCreateData = {
      name: seniorData.name,
      phone: seniorData.phone,
      timezone: seniorData.timezone || 'America/New_York',
      city: seniorData.city,
      state: seniorData.state,
      zipCode: seniorData.zipCode,
      additionalInfo,
      // Store interests as flat array (topics) - frontend sends strings
      interests: interests || [],
      // Store interest details and other consumer data in familyInfo
      familyInfo: {
        relation,
        donnaLanguage: clientFamilyInfo?.donnaLanguage || 'en',
        interestDetails: clientFamilyInfo?.interestDetails || {},
      },
      // Store call schedule and topics to avoid in preferredCallTimes
      preferredCallTimes: {
        schedule: callSchedule,
        topicsToAvoid: topicsToAvoid || [],
      },
    };

    const { senior, createdReminders } = await db.transaction(async (tx) => {
      const [senior] = await tx.insert(seniors).values({
        ...seniorCreateData,
        phone: normalizePhone(seniorCreateData.phone),
        timezone: resolveTimezoneFromProfile(seniorCreateData),
      }).returning();

      await tx.insert(caregivers).values({
        clerkUserId,
        seniorId: senior.id,
        role: 'caregiver',
      });

      // Create reminders from strings at the senior's local wall-clock time.
      const reminderTime = callSchedule?.time || '10:00';
      const reminderScheduledTime = wallTimeTodayToUtcDate(reminderTime, senior.timezone) || new Date();
      const reminderCronExpression = cronExpressionFromTime(reminderTime);

      const createdReminders = [];
      if (reminderStrings && reminderStrings.length > 0) {
        for (const reminderTitle of reminderStrings) {
          if (reminderTitle.trim()) {
            const [reminder] = await tx.insert(reminders).values({
              seniorId: senior.id,
              type: 'custom',
              title: reminderTitle.trim(),
              isRecurring: true,
              scheduledTime: reminderScheduledTime,
              cronExpression: reminderCronExpression,
            }).returning();
            createdReminders.push(reminder);
          }
        }
      }

      return { senior, createdReminders };
    });

    console.log(`[Onboarding] Completed: user=${clerkUserId}, senior=${maskName(senior.name)}, reminders=${createdReminders.length}`);

    res.json({
      senior,
      reminders: createdReminders,
    });
  } catch (error) {
    console.error('Onboarding failed:', error);

    // If phone already exists, find and reuse the existing senior + link caregiver
    const pgCode = error.code || error.cause?.code;
    const pgConstraint = error.constraint || error.cause?.constraint;
    if (pgCode === '23505' && pgConstraint?.includes('phone')) {
      try {
        const existing = await seniorService.findByPhone(seniorCreateData.phone);
        if (existing) {
          await caregiverService.linkUserToSenior(clerkUserId, existing.id, 'caregiver');
          console.log(`[Onboarding] Reused existing senior: user=${clerkUserId}, senior=${maskName(existing.name)}`);
          return res.json({ senior: existing, reminders: [] });
        }
      } catch (linkErr) {
        console.error('Onboarding duplicate phone fallback failed:', linkErr);
      }
      return res.status(409).json({ error: 'This phone number is already registered for another senior' });
    }

    // Pass through service-level errors with status codes (e.g. duplicate phone 409)
    const status = error.status || 500;
    const message = status < 500 ? error.message : 'Failed to complete onboarding. Please try again.';
    res.status(status).json({ error: message });
  }
});

export default router;
