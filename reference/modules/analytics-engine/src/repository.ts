/**
 * Analytics Repository
 *
 * Data access layer for analytics events.
 */

import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { eq, and, gte, lte, desc, sql, count } from 'drizzle-orm';
import { analyticsEvents, conversations } from '@donna/database';
import type { AnalyticsEvent, TimePeriod } from '@donna/shared/interfaces';

export interface IAnalyticsRepository {
  trackEvent(event: AnalyticsEvent): Promise<void>;
  getEventsBySenior(seniorId: string, period: TimePeriod): Promise<AnalyticsEvent[]>;
  getEventsByCaregiver(caregiverId: string, period: TimePeriod): Promise<AnalyticsEvent[]>;
  getEventsByType(type: string, period: TimePeriod): Promise<AnalyticsEvent[]>;
  getEventCount(type: string, period: TimePeriod): Promise<number>;
  getConversationMetrics(seniorId: string, period: TimePeriod): Promise<ConversationMetrics>;
}

export interface ConversationMetrics {
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  averageDuration: number;
}

export class AnalyticsRepository implements IAnalyticsRepository {
  constructor(private db: NeonHttpDatabase) {}

  /**
   * Track a new analytics event
   */
  async trackEvent(event: AnalyticsEvent): Promise<void> {
    await this.db.insert(analyticsEvents).values({
      type: event.type,
      seniorId: event.seniorId,
      timestamp: event.timestamp,
      metadata: event.metadata || {},
    });
  }

  /**
   * Get all events for a senior in a time period
   */
  async getEventsBySenior(seniorId: string, period: TimePeriod): Promise<AnalyticsEvent[]> {
    const result = await this.db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.seniorId, seniorId),
          gte(analyticsEvents.timestamp, period.start),
          lte(analyticsEvents.timestamp, period.end)
        )
      )
      .orderBy(desc(analyticsEvents.timestamp));

    return result.map(row => this.mapToEvent(row));
  }

  /**
   * Get all events for seniors under a caregiver
   */
  async getEventsByCaregiver(caregiverId: string, period: TimePeriod): Promise<AnalyticsEvent[]> {
    const result = await this.db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.caregiverId, caregiverId),
          gte(analyticsEvents.timestamp, period.start),
          lte(analyticsEvents.timestamp, period.end)
        )
      )
      .orderBy(desc(analyticsEvents.timestamp));

    return result.map(row => this.mapToEvent(row));
  }

  /**
   * Get events by type in a time period
   */
  async getEventsByType(type: string, period: TimePeriod): Promise<AnalyticsEvent[]> {
    const result = await this.db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.type, type),
          gte(analyticsEvents.timestamp, period.start),
          lte(analyticsEvents.timestamp, period.end)
        )
      )
      .orderBy(desc(analyticsEvents.timestamp));

    return result.map(row => this.mapToEvent(row));
  }

  /**
   * Count events by type in a time period
   */
  async getEventCount(type: string, period: TimePeriod): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.type, type),
          gte(analyticsEvents.timestamp, period.start),
          lte(analyticsEvents.timestamp, period.end)
        )
      );

    return result[0]?.count || 0;
  }

  /**
   * Get conversation metrics for a senior
   */
  async getConversationMetrics(seniorId: string, period: TimePeriod): Promise<ConversationMetrics> {
    const result = await this.db
      .select({
        status: conversations.status,
        duration: sql<number>`EXTRACT(EPOCH FROM (${conversations.endedAt} - ${conversations.startedAt}))`,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.seniorId, seniorId),
          gte(conversations.startedAt, period.start),
          lte(conversations.startedAt, period.end)
        )
      );

    const totalCalls = result.length;
    const completedCalls = result.filter(r => r.status === 'completed').length;
    const failedCalls = result.filter(r => r.status === 'failed').length;

    // Calculate average duration for completed calls
    const durations = result
      .filter(r => r.status === 'completed' && r.duration)
      .map(r => r.duration || 0);

    const averageDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    return {
      totalCalls,
      completedCalls,
      failedCalls,
      averageDuration: Math.round(averageDuration),
    };
  }

  /**
   * Map database row to AnalyticsEvent
   */
  private mapToEvent(row: any): AnalyticsEvent {
    return {
      type: row.type,
      seniorId: row.seniorId,
      timestamp: row.timestamp,
      metadata: row.metadata || {},
    };
  }
}
