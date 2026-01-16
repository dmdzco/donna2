/**
 * Analytics Engine Module
 *
 * Tracks events and generates insights about:
 * - Senior engagement and well-being trends
 * - Call patterns and success rates
 * - Reminder completion and effectiveness
 * - Caregiver dashboard metrics
 * - System health and performance
 */

import type {
  IAnalyticsEngine,
  ISeniorProfiles,
  IConversationManager,
  IReminderManagement,
  AnalyticsEvent,
  TimePeriod,
  SeniorInsights,
  CaregiverDashboard,
  ReportType,
  ReportParams,
  Report,
  SystemMetrics,
  ActivityItem,
} from '@donna/shared/interfaces';
import type { IAnalyticsRepository } from './repository';

export class AnalyticsEngineService implements IAnalyticsEngine {
  constructor(
    private repository: IAnalyticsRepository,
    private seniorProfiles: ISeniorProfiles,
    private conversationManager: IConversationManager,
    private reminderManagement: IReminderManagement
  ) {}

  /**
   * Track an analytics event
   */
  async trackEvent(event: AnalyticsEvent): Promise<void> {
    // Validate event
    if (!event.type || !event.seniorId) {
      throw new Error('Event type and seniorId are required');
    }

    // Verify senior exists
    const senior = await this.seniorProfiles.getById(event.seniorId);
    if (!senior) {
      throw new Error(`Senior with id ${event.seniorId} not found`);
    }

    await this.repository.trackEvent(event);
  }

  /**
   * Generate insights for a specific senior
   */
  async getSeniorInsights(seniorId: string, period: TimePeriod): Promise<SeniorInsights> {
    const senior = await this.seniorProfiles.getById(seniorId);
    if (!senior) {
      throw new Error(`Senior with id ${seniorId} not found`);
    }

    // Get conversation metrics
    const metrics = await this.repository.getConversationMetrics(seniorId, period);

    // Calculate call frequency (calls per week)
    const daysInPeriod = Math.ceil(
      (period.end.getTime() - period.start.getTime()) / (1000 * 60 * 60 * 24)
    );
    const callFrequency = (metrics.totalCalls / daysInPeriod) * 7;

    // Get concern events
    const concernEvents = await this.repository.getEventsBySenior(seniorId, period);
    const concernCount = concernEvents.filter(e => e.type === 'concern_flagged').length;

    // Calculate reminder completion rate
    const reminderDelivered = concernEvents.filter(e => e.type === 'reminder_delivered').length;
    const reminders = await this.reminderManagement.list(seniorId);
    const reminderCompletionRate = reminders.length > 0
      ? (reminderDelivered / reminders.length) * 100
      : 0;

    // Get recent context for last call date
    const context = await this.conversationManager.getRecentContext(seniorId, 1);

    // Calculate engagement score (simplified)
    const engagementScore = this.calculateEngagementScore(
      callFrequency,
      metrics.averageDuration,
      concernCount
    );

    // Determine sentiment trend (simplified - would use ML in production)
    const sentimentTrend = this.analyzeSentimentTrend(concernCount, engagementScore);

    return {
      callFrequency: Math.round(callFrequency * 10) / 10,
      averageDuration: metrics.averageDuration,
      sentimentTrend,
      engagementScore,
      topTopics: await this.extractTopTopics(seniorId, period),
      concernCount,
      reminderCompletionRate: Math.round(reminderCompletionRate),
      lastCallDate: context.lastCallDate,
    };
  }

  /**
   * Generate caregiver dashboard data
   */
  async getCaregiverDashboard(caregiverId: string): Promise<CaregiverDashboard> {
    // Get all seniors for this caregiver
    const seniors = await this.seniorProfiles.list(caregiverId);

    if (seniors.length === 0) {
      return {
        totalSeniors: 0,
        activeSeniors: 0,
        totalCallsThisWeek: 0,
        pendingConcerns: 0,
        upcomingReminders: [],
        recentActivity: [],
      };
    }

    const totalSeniors = seniors.length;

    // Calculate active seniors (had call in last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    let activeSeniors = 0;
    let totalCallsThisWeek = 0;
    let pendingConcerns = 0;

    for (const senior of seniors) {
      const context = await this.conversationManager.getRecentContext(senior.id, 1);
      if (context.lastCallDate && context.lastCallDate > weekAgo) {
        activeSeniors++;
      }

      const metrics = await this.repository.getConversationMetrics(senior.id, {
        start: weekAgo,
        end: new Date(),
      });
      totalCallsThisWeek += metrics.totalCalls;

      const concerns = await this.repository.getEventsBySenior(senior.id, {
        start: weekAgo,
        end: new Date(),
      });
      pendingConcerns += concerns.filter(e => e.type === 'concern_flagged').length;
    }

    // Get upcoming reminders
    const upcomingReminders = [];
    for (const senior of seniors) {
      const reminders = await this.reminderManagement.getPendingForSenior(senior.id);
      upcomingReminders.push(...reminders.slice(0, 3)); // Top 3 per senior
    }

    // Get recent activity
    const recentActivity = await this.getRecentActivity(caregiverId, 10);

    return {
      totalSeniors,
      activeSeniors,
      totalCallsThisWeek,
      pendingConcerns,
      upcomingReminders: upcomingReminders.slice(0, 10), // Top 10 overall
      recentActivity,
    };
  }

  /**
   * Generate a report
   */
  async generateReport(reportType: ReportType, params: ReportParams): Promise<Report> {
    let data: any;

    switch (reportType) {
      case 'weekly_summary':
        data = await this.generateWeeklySummary(params);
        break;
      case 'monthly_summary':
        data = await this.generateMonthlySummary(params);
        break;
      case 'senior_detailed':
        if (!params.seniorId) {
          throw new Error('seniorId required for senior_detailed report');
        }
        data = await this.generateSeniorDetailedReport(params.seniorId, params.period);
        break;
      case 'system_health':
        data = await this.getSystemMetrics();
        break;
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }

    return {
      type: reportType,
      generatedAt: new Date(),
      data,
      format: params.format || 'json',
    };
  }

  /**
   * Get system-wide metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const period: TimePeriod = { start: last24Hours, end: now };

    const totalCalls = await this.repository.getEventCount('call_completed', period);
    const failedCalls = await this.repository.getEventCount('call_failed', period);
    const startedCalls = await this.repository.getEventCount('call_started', period);

    const successRate = startedCalls > 0
      ? ((totalCalls / startedCalls) * 100)
      : 100;

    const errorRate = startedCalls > 0
      ? ((failedCalls / startedCalls) * 100)
      : 0;

    // Get active users (seniors with calls in last 24h)
    const allSeniors = await this.seniorProfiles.getAll();
    let activeUsers = 0;
    for (const senior of allSeniors) {
      const events = await this.repository.getEventsBySenior(senior.id, period);
      if (events.some(e => e.type === 'call_completed' || e.type === 'call_started')) {
        activeUsers++;
      }
    }

    return {
      totalCalls: totalCalls + failedCalls,
      successRate: Math.round(successRate),
      averageLatency: 0, // Would track this with performance monitoring
      activeUsers,
      errorRate: Math.round(errorRate),
    };
  }

  /**
   * Calculate engagement score based on activity metrics
   */
  private calculateEngagementScore(
    callFrequency: number,
    averageDuration: number,
    concernCount: number
  ): number {
    // Simplified scoring algorithm
    let score = 50; // Base score

    // Call frequency impact (0-30 points)
    if (callFrequency >= 3) score += 30;
    else if (callFrequency >= 1) score += 20;
    else if (callFrequency >= 0.5) score += 10;

    // Average duration impact (0-20 points)
    if (averageDuration >= 300) score += 20; // 5+ minutes
    else if (averageDuration >= 180) score += 10; // 3+ minutes

    // Concern impact (negative)
    score -= concernCount * 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Analyze sentiment trend
   */
  private analyzeSentimentTrend(concernCount: number, engagementScore: number): 'improving' | 'stable' | 'declining' {
    if (concernCount > 3 || engagementScore < 40) {
      return 'declining';
    }
    if (engagementScore > 70 && concernCount === 0) {
      return 'improving';
    }
    return 'stable';
  }

  /**
   * Extract top topics from conversations
   */
  private async extractTopTopics(seniorId: string, period: TimePeriod): Promise<string[]> {
    // Simplified - would analyze conversation content in production
    return ['family', 'health', 'hobbies'];
  }

  /**
   * Get recent activity for caregiver dashboard
   */
  private async getRecentActivity(caregiverId: string, limit: number): Promise<ActivityItem[]> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const events = await this.repository.getEventsByCaregiver(caregiverId, {
      start: weekAgo,
      end: new Date(),
    });

    const activities: ActivityItem[] = [];

    for (const event of events.slice(0, limit)) {
      const senior = await this.seniorProfiles.getById(event.seniorId);
      if (!senior) continue;

      let type: 'call' | 'concern' | 'reminder' = 'call';
      let description = '';

      if (event.type === 'call_completed') {
        type = 'call';
        description = 'Completed call';
      } else if (event.type === 'concern_flagged') {
        type = 'concern';
        description = event.metadata.concern || 'Concern flagged';
      } else if (event.type === 'reminder_delivered') {
        type = 'reminder';
        description = event.metadata.title || 'Reminder delivered';
      }

      activities.push({
        type,
        seniorId: senior.id,
        seniorName: senior.name,
        description,
        timestamp: event.timestamp,
      });
    }

    return activities;
  }

  /**
   * Generate weekly summary report
   */
  private async generateWeeklySummary(params: ReportParams): Promise<any> {
    if (!params.caregiverId) {
      throw new Error('caregiverId required for weekly summary');
    }

    const dashboard = await this.getCaregiverDashboard(params.caregiverId);

    return {
      period: params.period,
      summary: {
        totalSeniors: dashboard.totalSeniors,
        activeSeniors: dashboard.activeSeniors,
        totalCalls: dashboard.totalCallsThisWeek,
        concerns: dashboard.pendingConcerns,
      },
      recentActivity: dashboard.recentActivity,
    };
  }

  /**
   * Generate monthly summary report
   */
  private async generateMonthlySummary(params: ReportParams): Promise<any> {
    // Similar to weekly but with broader metrics
    return this.generateWeeklySummary(params);
  }

  /**
   * Generate detailed report for a senior
   */
  private async generateSeniorDetailedReport(seniorId: string, period: TimePeriod): Promise<any> {
    const insights = await this.getSeniorInsights(seniorId, period);
    const senior = await this.seniorProfiles.getById(seniorId);

    return {
      senior,
      insights,
      period,
    };
  }
}
