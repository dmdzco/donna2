import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { eq, and, lte, desc } from 'drizzle-orm';
import { scheduledCalls } from '@donna/database';
import type { ScheduledCall, CallSchedule } from '@donna/shared/interfaces';

export interface IScheduledCallRepository {
  create(schedule: CallSchedule): Promise<ScheduledCall>;
  findById(id: string): Promise<ScheduledCall | null>;
  findBySeniorId(seniorId: string, limit?: number): Promise<ScheduledCall[]>;
  findPending(limit?: number): Promise<ScheduledCall[]>;
  update(id: string, data: Partial<ScheduledCall>): Promise<ScheduledCall>;
  cancel(id: string): Promise<void>;
}

export class ScheduledCallRepository implements IScheduledCallRepository {
  constructor(private db: NeonHttpDatabase) {}

  async create(schedule: CallSchedule): Promise<ScheduledCall> {
    const [result] = await this.db
      .insert(scheduledCalls)
      .values({
        seniorId: schedule.seniorId,
        type: schedule.type,
        scheduledTime: schedule.scheduledTime,
        reminderIds: schedule.reminderIds || [],
        status: 'pending',
        retryCount: 0,
        maxRetries: schedule.maxRetries || 3,
      })
      .returning();

    return this.mapToScheduledCall(result);
  }

  async findById(id: string): Promise<ScheduledCall | null> {
    const result = await this.db
      .select()
      .from(scheduledCalls)
      .where(eq(scheduledCalls.id, id))
      .limit(1);

    return result.length > 0 ? this.mapToScheduledCall(result[0]) : null;
  }

  async findBySeniorId(seniorId: string, limit: number = 10): Promise<ScheduledCall[]> {
    const result = await this.db
      .select()
      .from(scheduledCalls)
      .where(eq(scheduledCalls.seniorId, seniorId))
      .orderBy(desc(scheduledCalls.scheduledTime))
      .limit(limit);

    return result.map(row => this.mapToScheduledCall(row));
  }

  async findPending(limit: number = 100): Promise<ScheduledCall[]> {
    const now = new Date();

    const result = await this.db
      .select()
      .from(scheduledCalls)
      .where(
        and(
          eq(scheduledCalls.status, 'pending'),
          lte(scheduledCalls.scheduledTime, now)
        )
      )
      .orderBy(scheduledCalls.scheduledTime)
      .limit(limit);

    return result.map(row => this.mapToScheduledCall(row));
  }

  async update(id: string, data: Partial<ScheduledCall>): Promise<ScheduledCall> {
    const updateData: any = {};

    if (data.scheduledTime !== undefined) updateData.scheduledTime = data.scheduledTime;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.retryCount !== undefined) updateData.retryCount = data.retryCount;
    if (data.conversationId !== undefined) updateData.conversationId = data.conversationId;
    if (data.reminderIds !== undefined) updateData.reminderIds = data.reminderIds;

    if (Object.keys(updateData).length === 0) {
      const scheduled = await this.findById(id);
      if (!scheduled) throw new Error(`Scheduled call ${id} not found`);
      return scheduled;
    }

    updateData.updatedAt = new Date();

    const result = await this.db
      .update(scheduledCalls)
      .set(updateData)
      .where(eq(scheduledCalls.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error(`Scheduled call ${id} not found`);
    }

    return this.mapToScheduledCall(result[0]);
  }

  async cancel(id: string): Promise<void> {
    const result = await this.db
      .update(scheduledCalls)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(scheduledCalls.id, id))
      .returning({ id: scheduledCalls.id });

    if (result.length === 0) {
      throw new Error(`Scheduled call ${id} not found`);
    }
  }

  private mapToScheduledCall(row: any): ScheduledCall {
    return {
      id: row.id,
      seniorId: row.seniorId,
      type: row.type,
      scheduledTime: new Date(row.scheduledTime),
      reminderIds: row.reminderIds || [],
      status: row.status,
      retryCount: row.retryCount,
      maxRetries: row.maxRetries,
      conversationId: row.conversationId,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
