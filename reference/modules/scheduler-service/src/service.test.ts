import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchedulerService } from './service';

/**
 * Unit tests for SchedulerService
 *
 * Note: Full integration tests require Redis and BullMQ setup.
 */
describe('SchedulerService', () => {
  describe('constructor', () => {
    it('should create service with dependencies', () => {
      const mockRepository = {
        create: vi.fn(),
        findById: vi.fn(),
        findBySeniorId: vi.fn(),
        findPending: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      const mockCallOrchestrator = {
        initiateCall: vi.fn(),
        handleCallEvent: vi.fn(),
        endCall: vi.fn(),
        onCallAnswered: vi.fn(),
        onCallEnded: vi.fn(),
        onCallFailed: vi.fn(),
      };
      const mockRedisConfig = { url: 'redis://localhost:6379', token: 'test' };

      const service = new SchedulerService(
        mockRepository as any,
        mockCallOrchestrator as any,
        mockRedisConfig
      );

      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(SchedulerService);
    });
  });

  describe('interface compliance', () => {
    it('should implement ISchedulerService interface', () => {
      const mockRepository = {
        create: vi.fn(),
        findById: vi.fn(),
        findBySeniorId: vi.fn(),
        findPending: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      const mockCallOrchestrator = {
        initiateCall: vi.fn(),
        handleCallEvent: vi.fn(),
        endCall: vi.fn(),
        onCallAnswered: vi.fn(),
        onCallEnded: vi.fn(),
        onCallFailed: vi.fn(),
      };
      const mockRedisConfig = { url: 'redis://localhost:6379', token: 'test' };

      const service = new SchedulerService(
        mockRepository as any,
        mockCallOrchestrator as any,
        mockRedisConfig
      );

      expect(typeof service.scheduleCall).toBe('function');
      expect(typeof service.cancelScheduledCall).toBe('function');
      expect(typeof service.getUpcomingCalls).toBe('function');
      expect(typeof service.updateSchedule).toBe('function');
      expect(typeof service.retryFailedCall).toBe('function');
      expect(typeof service.shutdown).toBe('function');
    });
  });
});
