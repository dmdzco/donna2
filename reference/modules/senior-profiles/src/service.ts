import {
  ISeniorProfiles,
  Senior,
  SeniorData,
  SeniorFilters,
  SeniorPreferences,
  NotFoundError,
} from '@donna/shared/interfaces';
import { ISeniorRepository } from './repository';

/**
 * Senior Profiles Service
 *
 * Handles all business logic for managing elderly individual profiles.
 * This module is responsible for:
 * - CRUD operations on senior profiles
 * - Preference management
 * - Validation and authorization
 *
 * Dependencies: Only the repository (database access)
 * No dependencies on other modules!
 */
export class SeniorProfilesService implements ISeniorProfiles {
  constructor(private repository: ISeniorRepository) {}

  async create(caregiverId: string, data: SeniorData): Promise<Senior> {
    // Validate required fields
    this.validateSeniorData(data);

    // Create in database
    const senior = await this.repository.create(caregiverId, data);

    return senior;
  }

  async getById(seniorId: string): Promise<Senior> {
    const senior = await this.repository.findById(seniorId);

    if (!senior) {
      throw new NotFoundError('Senior', seniorId);
    }

    return senior;
  }

  async list(caregiverId: string, filters?: SeniorFilters): Promise<Senior[]> {
    let seniors = await this.repository.findByCaregiverId(caregiverId);

    // Apply filters
    if (filters) {
      if (filters.isActive !== undefined) {
        seniors = seniors.filter(s => s.isActive === filters.isActive);
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        seniors = seniors.filter(
          s =>
            s.name.toLowerCase().includes(searchLower) ||
            s.phone.includes(searchLower)
        );
      }
    }

    return seniors;
  }

  async getAll(): Promise<Senior[]> {
    return this.repository.findAll();
  }

  async update(seniorId: string, data: Partial<SeniorData>): Promise<Senior> {
    // Validate partial data
    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new Error('Name cannot be empty');
    }

    if (data.phone !== undefined && data.phone.length < 10) {
      throw new Error('Phone number must be at least 10 characters');
    }

    // Update in database
    const senior = await this.repository.update(seniorId, data);

    return senior;
  }

  async delete(seniorId: string): Promise<void> {
    await this.repository.delete(seniorId);
  }

  async getPreferences(seniorId: string): Promise<SeniorPreferences> {
    const senior = await this.getById(seniorId);

    // Extract preferences from senior profile
    // In a more complex system, this might be a separate table
    return {
      voiceSpeed: 'normal', // Could be stored in senior.metadata
      callFrequency: 'daily',
      topics: senior.interests,
      doNotDisturb: false,
    };
  }

  async updatePreferences(
    seniorId: string,
    prefs: Partial<SeniorPreferences>
  ): Promise<void> {
    // For now, preferences are derived from profile data
    // Update interests if topics are changed
    if (prefs.topics) {
      await this.update(seniorId, { interests: prefs.topics });
    }
  }

  /**
   * Validate senior data before creation
   */
  private validateSeniorData(data: SeniorData): void {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Name is required');
    }

    if (!data.phone || data.phone.length < 10) {
      throw new Error('Valid phone number is required (at least 10 characters)');
    }

    // Validate timezone if provided
    if (data.timezone) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: data.timezone });
      } catch {
        throw new Error(`Invalid timezone: ${data.timezone}`);
      }
    }
  }

  /**
   * Check if senior belongs to caregiver (for authorization)
   */
  async verifySeniorAccess(seniorId: string, caregiverId: string): Promise<boolean> {
    const senior = await this.repository.findById(seniorId);
    return senior !== null && senior.caregiverId === caregiverId;
  }
}
