import { Router } from 'express';
import { db } from '../db/client.js';
import { caregivers, reminders, seniors } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import { onboardingSchema } from '../validators/schemas.js';
import { maskName } from '../lib/sanitize.js';
import { cronExpressionFromTime, resolveTimezoneFromProfile, wallTimeTodayToUtcDate } from '../lib/timezone.js';
import { routeError } from './helpers.js';

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
    if (error.code === '23505' && error.constraint?.includes('phone')) {
      return res.status(409).json({ error: 'This phone number is already registered for another senior' });
    }

    routeError(res, error, 'POST /api/onboarding');
  }
});

export default router;
