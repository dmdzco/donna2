/**
 * Route Aggregator
 *
 * Mounts all route modules onto the Express app.
 */

import healthRoutes from './health.js';
import voiceRoutes from './voice.js';
import callRoutes from './calls.js';
import seniorRoutes from './seniors.js';
import memoryRoutes from './memories.js';
import conversationRoutes from './conversations.js';
import reminderRoutes from './reminders.js';
import onboardingRoutes from './onboarding.js';
import caregiverRoutes from './caregivers.js';
import statsRoutes from './stats.js';
import observabilityRoutes from './observability.js';

export function mountRoutes(app) {
  app.use(healthRoutes);
  app.use(voiceRoutes);
  app.use(callRoutes);
  app.use(seniorRoutes);
  app.use(memoryRoutes);
  app.use(conversationRoutes);
  app.use(reminderRoutes);
  app.use(onboardingRoutes);
  app.use(caregiverRoutes);
  app.use(statsRoutes);
  app.use(observabilityRoutes);
}
