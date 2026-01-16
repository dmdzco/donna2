import type {
  IReminderManagement,
  Reminder,
  ReminderData,
  ReminderFilters,
  DeliveryRecord,
  ISeniorProfiles,
} from '@donna/shared/interfaces';
import type { IReminderRepository } from './repository';

/**
 * Reminder Management Service
 *
 * Handles CRUD operations for medication and appointment reminders.
 * Manages reminder delivery tracking and scheduling.
 */
export class ReminderManagementService implements IReminderManagement {
  constructor(
    private repository: IReminderRepository,
    private seniorProfiles: ISeniorProfiles
  ) {}

  /**
   * Create a new reminder for a senior
   */
  async create(seniorId: string, data: ReminderData): Promise<Reminder> {
    // Verify senior exists
    const senior = await this.seniorProfiles.getById(seniorId);
    if (!senior) {
      throw new Error(`Senior with id ${seniorId} not found`);
    }

    // Validate reminder data
    if (!data.title || data.title.trim() === '') {
      throw new Error('Reminder title is required');
    }

    if (!['medication', 'appointment', 'custom'].includes(data.type)) {
      throw new Error('Invalid reminder type');
    }

    // Create reminder
    return this.repository.create(seniorId, data);
  }

  /**
   * List all reminders for a senior with optional filters
   */
  async list(seniorId: string, filters?: ReminderFilters): Promise<Reminder[]> {
    return this.repository.findBySeniorId(seniorId, filters);
  }

  /**
   * Update an existing reminder
   */
  async update(reminderId: string, data: Partial<ReminderData>): Promise<Reminder> {
    const existing = await this.repository.findById(reminderId);
    if (!existing) {
      throw new Error(`Reminder with id ${reminderId} not found`);
    }

    // Validate type if being updated
    if (data.type && !['medication', 'appointment', 'custom'].includes(data.type)) {
      throw new Error('Invalid reminder type');
    }

    return this.repository.update(reminderId, data);
  }

  /**
   * Delete a reminder
   */
  async delete(reminderId: string): Promise<void> {
    const existing = await this.repository.findById(reminderId);
    if (!existing) {
      throw new Error(`Reminder with id ${reminderId} not found`);
    }

    await this.repository.delete(reminderId);
  }

  /**
   * Get all pending reminders for a senior that should be delivered
   */
  async getPendingForSenior(seniorId: string): Promise<Reminder[]> {
    return this.repository.getPending(seniorId);
  }

  /**
   * Mark a reminder as delivered during a conversation
   */
  async markDelivered(reminderId: string, conversationId: string): Promise<void> {
    const reminder = await this.repository.findById(reminderId);
    if (!reminder) {
      throw new Error(`Reminder with id ${reminderId} not found`);
    }

    await this.repository.markDelivered(reminderId, conversationId);
  }

  /**
   * Get delivery history for a reminder
   * Note: This would require a separate delivery_history table to track all deliveries
   * For now, we just return the last delivery time from the reminder record
   */
  async getDeliveryHistory(reminderId: string): Promise<DeliveryRecord[]> {
    const reminder = await this.repository.findById(reminderId);
    if (!reminder) {
      throw new Error(`Reminder with id ${reminderId} not found`);
    }

    // TODO: Implement proper delivery history tracking with a separate table
    // For now, return empty array or last delivery if exists
    if (reminder.lastDeliveredAt) {
      return [
        {
          reminderId: reminder.id,
          conversationId: 'unknown', // Would come from delivery_history table
          deliveredAt: reminder.lastDeliveredAt,
          acknowledged: true, // Would come from delivery_history table
        },
      ];
    }

    return [];
  }
}
