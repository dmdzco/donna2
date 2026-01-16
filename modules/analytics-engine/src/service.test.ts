import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsEngineService } from './service';
import type {
  IAnalyticsRepository,
  ConversationMetrics,
} from './repository';
import type {
  ISeniorProfiles,
  IConversationManager,
  IReminderManagement,
  Senior,
  AnalyticsEvent,
  TimePeriod,
} from '@donna/shared/interfaces';

describe('AnalyticsEngineService', () => {
  let service: AnalyticsEngineService;
  let mockRepository: jest.Mocked<IAnalyticsRepository>;
  let mockSeniorProfiles: jest.Mocked<ISeniorProfiles>;
  let mockConversationManager: jest.Mocked<IConversationManager>;
  let mockReminderManagement: jest.Mocked<IReminderManagement>;

  const mockSenior: Senior = {
    id: 'senior-123',
    caregiverId: 'caregiver-123',
    name: 'Margaret Smith',
    phone: '+1234567890',
    preferences: {
      voiceId: 'rachel',
      callFrequency: 'daily',
      preferredCallTime: '10:00',
    },
    medicalInfo: {
      conditions: [],
      medications: [],
      allergies: [],
      emergencyContact: {
        name: 'John',
        phone: '+1111111111',
        relationship: 'son',
      },
    },
    interests: ['gardening'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPeriod: TimePeriod = {
    start: new Date('2026-01-01'),
    end: new Date('2026-01-07'),
  };

  beforeEach(() => {
    mockRepository = {
      trackEvent: vi.fn(),
      getEventsBySenior: vi.fn(),
      getEventsByCaregiver: vi.fn(),
      getEventsByType: vi.fn(),
      getEventCount: vi.fn(),
      getConversationMetrics: vi.fn(),
    } as any;

    mockSeniorProfiles = {
      create: vi.fn(),
      getById: vi.fn(),
      getAll: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as any;

    mockConversationManager = {
      create: vi.fn(),
      getById: vi.fn(),
      getTurns: vi.fn(),
      getRecentContext: vi.fn(),
      addTurn: vi.fn(),
      update: vi.fn(),
      markReminderDelivered: vi.fn(),
      flagConcern: vi.fn(),
    } as any;

    mockReminderManagement = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getPending: vi.fn(),
      markDelivered: vi.fn(),
      getDeliveryHistory: vi.fn(),
    } as any;

    service = new AnalyticsEngineService(
      mockRepository,
      mockSeniorProfiles,
      mockConversationManager,
      mockReminderManagement
    );
  });

  describe('trackEvent', () => {
    it('should track a valid analytics event', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(mockSenior);
      mockRepository.trackEvent.mockResolvedValue();

      const event: AnalyticsEvent = {
        type: 'call_completed',
        seniorId: 'senior-123',
        timestamp: new Date(),
        metadata: { duration: 300 },
      };

      await service.trackEvent(event);

      expect(mockSeniorProfiles.getById).toHaveBeenCalledWith('senior-123');
      expect(mockRepository.trackEvent).toHaveBeenCalledWith(event);
    });

    it('should throw error if event is missing required fields', async () => {
      const invalidEvent = {
        type: '',
        seniorId: 'senior-123',
        timestamp: new Date(),
        metadata: {},
      } as AnalyticsEvent;

      await expect(service.trackEvent(invalidEvent)).rejects.toThrow(
        'Event type and seniorId are required'
      );
    });

    it('should throw error if senior not found', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(null);

      const event: AnalyticsEvent = {
        type: 'call_completed',
        seniorId: 'invalid-id',
        timestamp: new Date(),
        metadata: {},
      };

      await expect(service.trackEvent(event)).rejects.toThrow(
        'Senior with id invalid-id not found'
      );
    });
  });

  describe('getSeniorInsights', () => {
    it('should generate insights for a senior', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(mockSenior);

      const mockMetrics: ConversationMetrics = {
        totalCalls: 14,
        completedCalls: 12,
        failedCalls: 2,
        averageDuration: 240,
      };

      mockRepository.getConversationMetrics.mockResolvedValue(mockMetrics);
      mockRepository.getEventsBySenior.mockResolvedValue([
        {
          type: 'concern_flagged',
          seniorId: 'senior-123',
          timestamp: new Date(),
          metadata: {},
        },
      ]);
      mockReminderManagement.list.mockResolvedValue([
        {
          id: 'rem-1',
          seniorId: 'senior-123',
          type: 'medication',
          title: 'Take pill',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockConversationManager.getRecentContext.mockResolvedValue({
        recentSummaries: [],
        lastCallDate: new Date('2026-01-05'),
        importantMemories: [],
        recentTopics: [],
        preferences: mockSenior.preferences,
      });

      const insights = await service.getSeniorInsights('senior-123', mockPeriod);

      expect(insights.callFrequency).toBeGreaterThan(0);
      expect(insights.averageDuration).toBe(240);
      expect(insights.concernCount).toBe(1);
      expect(insights.sentimentTrend).toBeDefined();
      expect(insights.engagementScore).toBeGreaterThan(0);
      expect(insights.lastCallDate).toBeInstanceOf(Date);
    });

    it('should throw error if senior not found', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(null);

      await expect(service.getSeniorInsights('invalid-id', mockPeriod)).rejects.toThrow(
        'Senior with id invalid-id not found'
      );
    });

    it('should handle zero calls gracefully', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(mockSenior);

      const mockMetrics: ConversationMetrics = {
        totalCalls: 0,
        completedCalls: 0,
        failedCalls: 0,
        averageDuration: 0,
      };

      mockRepository.getConversationMetrics.mockResolvedValue(mockMetrics);
      mockRepository.getEventsBySenior.mockResolvedValue([]);
      mockReminderManagement.list.mockResolvedValue([]);
      mockConversationManager.getRecentContext.mockResolvedValue({
        recentSummaries: [],
        lastCallDate: undefined,
        importantMemories: [],
        recentTopics: [],
        preferences: mockSenior.preferences,
      });

      const insights = await service.getSeniorInsights('senior-123', mockPeriod);

      expect(insights.callFrequency).toBe(0);
      expect(insights.averageDuration).toBe(0);
      expect(insights.concernCount).toBe(0);
    });
  });

  describe('getCaregiverDashboard', () => {
    it('should generate dashboard for caregiver', async () => {
      mockSeniorProfiles.getAll.mockResolvedValue([mockSenior]);
      mockConversationManager.getRecentContext.mockResolvedValue({
        recentSummaries: [],
        lastCallDate: new Date(),
        importantMemories: [],
        recentTopics: [],
        preferences: mockSenior.preferences,
      });
      mockRepository.getConversationMetrics.mockResolvedValue({
        totalCalls: 5,
        completedCalls: 5,
        failedCalls: 0,
        averageDuration: 200,
      });
      mockRepository.getEventsBySenior.mockResolvedValue([]);
      mockReminderManagement.getPending.mockResolvedValue([]);
      mockRepository.getEventsByCaregiver.mockResolvedValue([]);

      const dashboard = await service.getCaregiverDashboard('caregiver-123');

      expect(dashboard.totalSeniors).toBe(1);
      expect(dashboard.activeSeniors).toBeGreaterThanOrEqual(0);
      expect(dashboard.totalCallsThisWeek).toBeGreaterThanOrEqual(0);
      expect(dashboard.pendingConcerns).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(dashboard.upcomingReminders)).toBe(true);
      expect(Array.isArray(dashboard.recentActivity)).toBe(true);
    });

    it('should handle caregiver with no seniors', async () => {
      mockSeniorProfiles.getAll.mockResolvedValue([]);

      const dashboard = await service.getCaregiverDashboard('caregiver-999');

      expect(dashboard.totalSeniors).toBe(0);
      expect(dashboard.activeSeniors).toBe(0);
      expect(dashboard.totalCallsThisWeek).toBe(0);
      expect(dashboard.upcomingReminders).toEqual([]);
      expect(dashboard.recentActivity).toEqual([]);
    });
  });

  describe('generateReport', () => {
    it('should generate weekly summary report', async () => {
      mockSeniorProfiles.getAll.mockResolvedValue([mockSenior]);
      mockConversationManager.getRecentContext.mockResolvedValue({
        recentSummaries: [],
        lastCallDate: new Date(),
        importantMemories: [],
        recentTopics: [],
        preferences: mockSenior.preferences,
      });
      mockRepository.getConversationMetrics.mockResolvedValue({
        totalCalls: 5,
        completedCalls: 5,
        failedCalls: 0,
        averageDuration: 200,
      });
      mockRepository.getEventsBySenior.mockResolvedValue([]);
      mockReminderManagement.getPending.mockResolvedValue([]);
      mockRepository.getEventsByCaregiver.mockResolvedValue([]);

      const report = await service.generateReport('weekly_summary', {
        caregiverId: 'caregiver-123',
        period: mockPeriod,
      });

      expect(report.type).toBe('weekly_summary');
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.format).toBe('json');
      expect(report.data).toBeDefined();
    });

    it('should generate senior detailed report', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(mockSenior);
      mockRepository.getConversationMetrics.mockResolvedValue({
        totalCalls: 10,
        completedCalls: 9,
        failedCalls: 1,
        averageDuration: 250,
      });
      mockRepository.getEventsBySenior.mockResolvedValue([]);
      mockReminderManagement.list.mockResolvedValue([]);
      mockConversationManager.getRecentContext.mockResolvedValue({
        recentSummaries: [],
        lastCallDate: new Date(),
        importantMemories: [],
        recentTopics: [],
        preferences: mockSenior.preferences,
      });

      const report = await service.generateReport('senior_detailed', {
        seniorId: 'senior-123',
        period: mockPeriod,
      });

      expect(report.type).toBe('senior_detailed');
      expect(report.data.senior).toBeDefined();
      expect(report.data.insights).toBeDefined();
    });

    it('should throw error for senior_detailed without seniorId', async () => {
      await expect(
        service.generateReport('senior_detailed', {
          period: mockPeriod,
        })
      ).rejects.toThrow('seniorId required');
    });

    it('should generate system health report', async () => {
      mockRepository.getEventCount.mockResolvedValue(100);
      mockSeniorProfiles.getAll.mockResolvedValue([mockSenior]);
      mockRepository.getEventsBySenior.mockResolvedValue([
        {
          type: 'call_completed',
          seniorId: 'senior-123',
          timestamp: new Date(),
          metadata: {},
        },
      ]);

      const report = await service.generateReport('system_health', {
        period: mockPeriod,
      });

      expect(report.type).toBe('system_health');
      expect(report.data.totalCalls).toBeGreaterThanOrEqual(0);
      expect(report.data.successRate).toBeDefined();
    });
  });

  describe('getSystemMetrics', () => {
    it('should return system metrics', async () => {
      mockRepository.getEventCount.mockImplementation((type, period) => {
        if (type === 'call_completed') return Promise.resolve(90);
        if (type === 'call_failed') return Promise.resolve(10);
        if (type === 'call_started') return Promise.resolve(100);
        return Promise.resolve(0);
      });

      mockSeniorProfiles.getAll.mockResolvedValue([mockSenior]);
      mockRepository.getEventsBySenior.mockResolvedValue([
        {
          type: 'call_completed',
          seniorId: 'senior-123',
          timestamp: new Date(),
          metadata: {},
        },
      ]);

      const metrics = await service.getSystemMetrics();

      expect(metrics.totalCalls).toBe(100);
      expect(metrics.successRate).toBe(90);
      expect(metrics.errorRate).toBe(10);
      expect(metrics.activeUsers).toBeGreaterThanOrEqual(0);
      expect(metrics.averageLatency).toBeDefined();
    });

    it('should handle zero calls gracefully', async () => {
      mockRepository.getEventCount.mockResolvedValue(0);
      mockSeniorProfiles.getAll.mockResolvedValue([]);

      const metrics = await service.getSystemMetrics();

      expect(metrics.totalCalls).toBe(0);
      expect(metrics.successRate).toBe(100);
      expect(metrics.errorRate).toBe(0);
      expect(metrics.activeUsers).toBe(0);
    });
  });
});
