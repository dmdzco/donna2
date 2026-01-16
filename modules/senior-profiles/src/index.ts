/**
 * Senior Profiles Module
 *
 * This module handles all senior profile management.
 * It is completely independent and can be:
 * - Tested in isolation
 * - Deployed separately
 * - Replaced without affecting other modules
 */

export { SeniorProfilesService } from './service';
export { SeniorRepository, ISeniorRepository } from './repository';

// Re-export interfaces for convenience
export type {
  ISeniorProfiles,
  Senior,
  SeniorData,
  SeniorFilters,
  SeniorPreferences,
} from '@donna/shared/interfaces';
