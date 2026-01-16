import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { eq, asc } from 'drizzle-orm';
import { seniors } from '@donna/database';
import { Senior, SeniorData } from '@donna/shared/interfaces';

/**
 * Repository interface for database access
 * Separates data access from business logic
 */
export interface ISeniorRepository {
  create(caregiverId: string, data: SeniorData): Promise<Senior>;
  findById(seniorId: string): Promise<Senior | null>;
  findByCaregiverId(caregiverId: string): Promise<Senior[]>;
  findAll(): Promise<Senior[]>;
  update(seniorId: string, data: Partial<SeniorData>): Promise<Senior>;
  delete(seniorId: string): Promise<void>;
  exists(seniorId: string): Promise<boolean>;
}

/**
 * PostgreSQL implementation of Senior Repository using Drizzle ORM
 */
export class SeniorRepository implements ISeniorRepository {
  constructor(private db: NeonHttpDatabase) {}

  async create(caregiverId: string, data: SeniorData): Promise<Senior> {
    const [result] = await this.db
      .insert(seniors)
      .values({
        caregiverId,
        name: data.name,
        phone: data.phone,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString().split('T')[0] : undefined,
        timezone: data.timezone || 'America/New_York',
        locationCity: data.locationCity,
        locationState: data.locationState,
        interests: data.interests || [],
        familyInfo: data.familyInfo,
        medicalNotes: data.medicalNotes,
        preferredCallTimes: data.preferredCallTimes,
        quietHoursStart: data.quietHoursStart,
        quietHoursEnd: data.quietHoursEnd,
      })
      .returning();

    return this.mapToSenior(result);
  }

  async findById(seniorId: string): Promise<Senior | null> {
    const result = await this.db
      .select()
      .from(seniors)
      .where(eq(seniors.id, seniorId))
      .limit(1);

    return result.length > 0 ? this.mapToSenior(result[0]) : null;
  }

  async findByCaregiverId(caregiverId: string): Promise<Senior[]> {
    const result = await this.db
      .select()
      .from(seniors)
      .where(eq(seniors.caregiverId, caregiverId))
      .orderBy(asc(seniors.name));

    return result.map(row => this.mapToSenior(row));
  }

  async findAll(): Promise<Senior[]> {
    const result = await this.db
      .select()
      .from(seniors)
      .orderBy(asc(seniors.name));

    return result.map(row => this.mapToSenior(row));
  }

  async update(seniorId: string, data: Partial<SeniorData>): Promise<Senior> {
    const updateData: any = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.dateOfBirth !== undefined) {
      updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth).toISOString().split('T')[0] : null;
    }
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.locationCity !== undefined) updateData.locationCity = data.locationCity;
    if (data.locationState !== undefined) updateData.locationState = data.locationState;
    if (data.interests !== undefined) updateData.interests = data.interests;
    if (data.familyInfo !== undefined) updateData.familyInfo = data.familyInfo;
    if (data.medicalNotes !== undefined) updateData.medicalNotes = data.medicalNotes;
    if (data.preferredCallTimes !== undefined) updateData.preferredCallTimes = data.preferredCallTimes;
    if (data.quietHoursStart !== undefined) updateData.quietHoursStart = data.quietHoursStart;
    if (data.quietHoursEnd !== undefined) updateData.quietHoursEnd = data.quietHoursEnd;

    if (Object.keys(updateData).length === 0) {
      const senior = await this.findById(seniorId);
      if (!senior) throw new Error(`Senior ${seniorId} not found`);
      return senior;
    }

    updateData.updatedAt = new Date();

    const result = await this.db
      .update(seniors)
      .set(updateData)
      .where(eq(seniors.id, seniorId))
      .returning();

    if (result.length === 0) {
      throw new Error(`Senior ${seniorId} not found`);
    }

    return this.mapToSenior(result[0]);
  }

  async delete(seniorId: string): Promise<void> {
    const result = await this.db
      .delete(seniors)
      .where(eq(seniors.id, seniorId))
      .returning({ id: seniors.id });

    if (result.length === 0) {
      throw new Error(`Senior ${seniorId} not found`);
    }
  }

  async exists(seniorId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: seniors.id })
      .from(seniors)
      .where(eq(seniors.id, seniorId))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Map database row to Senior interface
   */
  private mapToSenior(row: any): Senior {
    return {
      id: row.id,
      caregiverId: row.caregiverId,
      name: row.name,
      phone: row.phone,
      dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : undefined,
      timezone: row.timezone,
      locationCity: row.locationCity,
      locationState: row.locationState,
      interests: row.interests || [],
      familyInfo: row.familyInfo,
      medicalNotes: row.medicalNotes,
      preferredCallTimes: row.preferredCallTimes,
      quietHoursStart: row.quietHoursStart,
      quietHoursEnd: row.quietHoursEnd,
      isActive: row.isActive,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
