import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { eq, and, desc } from 'drizzle-orm';
import { reminders } from '@donna/database';
import type { Reminder, ReminderData, ReminderFilters, DeliveryRecord } from '@donna/shared/interfaces';

export interface IReminderRepository {
  create(seniorId: string, data: ReminderData): Promise<Reminder>;
  findById(id: string): Promise<Reminder | null>;
  findBySeniorId(seniorId: string, filters?: ReminderFilters): Promise<Reminder[]>;
  update(id: string, data: Partial<ReminderData>): Promise<Reminder>;
  delete(id: string): Promise<void>;
  getPending(seniorId: string): Promise<Reminder[]>;
  markDelivered(id: string, conversationId: string): Promise<void>;
}

export class ReminderRepository implements IReminderRepository {
  constructor(private db: NeonHttpDatabase) {}

  async create(seniorId: string, data: ReminderData): Promise<Reminder> {
    const [result] = await this.db
      .insert(reminders)
      .values({
        seniorId,
        type: data.type,
        title: data.title,
        description: data.description,
        scheduleCron: data.scheduleCron,
        scheduledTime: data.scheduledTime,
        isRecurring: data.isRecurring || false,
        isActive: true,
        metadata: data.metadata || null,
      })
      .returning();

    return this.mapToReminder(result);
  }

  async findById(id: string): Promise<Reminder | null> {
    const result = await this.db
      .select()
      .from(reminders)
      .where(eq(reminders.id, id))
      .limit(1);

    return result.length > 0 ? this.mapToReminder(result[0]) : null;
  }

  async findBySeniorId(seniorId: string, filters?: ReminderFilters): Promise<Reminder[]> {
    let query = this.db
      .select()
      .from(reminders)
      .where(eq(reminders.seniorId, seniorId))
      .$dynamic();

    // Apply filters
    const conditions: any[] = [eq(reminders.seniorId, seniorId)];

    if (filters?.type) {
      conditions.push(eq(reminders.type, filters.type));
    }

    if (filters?.isActive !== undefined) {
      conditions.push(eq(reminders.isActive, filters.isActive));
    }

    if (filters?.isRecurring !== undefined) {
      conditions.push(eq(reminders.isRecurring, filters.isRecurring));
    }

    if (conditions.length > 1) {
      query = this.db
        .select()
        .from(reminders)
        .where(and(...conditions))
        .$dynamic();
    }

    const result = await query.orderBy(desc(reminders.createdAt));

    return result.map(row => this.mapToReminder(row));
  }

  async update(id: string, data: Partial<ReminderData>): Promise<Reminder> {
    const updateData: any = {};

    if (data.type !== undefined) updateData.type = data.type;
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.scheduleCron !== undefined) updateData.scheduleCron = data.scheduleCron;
    if (data.scheduledTime !== undefined) updateData.scheduledTime = data.scheduledTime;
    if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    if (Object.keys(updateData).length === 0) {
      const reminder = await this.findById(id);
      if (!reminder) throw new Error(`Reminder ${id} not found`);
      return reminder;
    }

    updateData.updatedAt = new Date();

    const result = await this.db
      .update(reminders)
      .set(updateData)
      .where(eq(reminders.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error(`Reminder ${id} not found`);
    }

    return this.mapToReminder(result[0]);
  }

  async delete(id: string): Promise<void> {
    const result = await this.db
      .delete(reminders)
      .where(eq(reminders.id, id))
      .returning({ id: reminders.id });

    if (result.length === 0) {
      throw new Error(`Reminder ${id} not found`);
    }
  }

  async getPending(seniorId: string): Promise<Reminder[]> {
    const now = new Date();

    const result = await this.db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.seniorId, seniorId),
          eq(reminders.isActive, true)
        )
      );

    // Filter reminders that are due (simplified logic, could be enhanced with cron parsing)
    const pending = result.filter(r => {
      if (r.scheduledTime) {
        return new Date(r.scheduledTime) <= now;
      }
      // If has scheduleCron, would need cron parser to determine if due
      return false;
    });

    return pending.map(row => this.mapToReminder(row));
  }

  async markDelivered(id: string, conversationId: string): Promise<void> {
    await this.db
      .update(reminders)
      .set({ lastDeliveredAt: new Date() })
      .where(eq(reminders.id, id));
  }

  private mapToReminder(row: any): Reminder {
    return {
      id: row.id,
      seniorId: row.seniorId,
      type: row.type,
      title: row.title,
      description: row.description,
      scheduleCron: row.scheduleCron,
      scheduledTime: row.scheduledTime ? new Date(row.scheduledTime) : undefined,
      isRecurring: row.isRecurring,
      isActive: row.isActive,
      lastDeliveredAt: row.lastDeliveredAt ? new Date(row.lastDeliveredAt) : undefined,
      metadata: row.metadata || {},
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
