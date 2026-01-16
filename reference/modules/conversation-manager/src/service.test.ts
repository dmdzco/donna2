import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationManagerService } from './service';
import type { IConversationRepository } from './repository';
import type { Conversation } from '@donna/shared/interfaces';

describe('ConversationManagerService', () => {
  let service: ConversationManagerService;
  let mockRepository: IConversationRepository;

  beforeEach(() => {
    mockRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findBySeniorId: vi.fn(),
      addTurn: vi.fn(),
      getTurns: vi.fn(),
      update: vi.fn(),
    };

    service = new ConversationManagerService(mockRepository);
  });

  describe('create', () => {
    it('should create a conversation record', async () => {
      const mockConversation: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        status: 'in_progress',
        startedAt: new Date(),
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
      };

      (mockRepository.create as any).mockResolvedValue(mockConversation);

      const result = await service.create({
        seniorId: 'senior-123',
        type: 'manual',
        reminderIds: ['rem-1'],
      });

      expect(result.id).toBe('conv-123');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          seniorId: 'senior-123',
          initiatedBy: 'manual',
          metadata: { reminderIds: ['rem-1'] },
        })
      );
    });

    it('should create conversation without reminder IDs', async () => {
      const mockConversation: Conversation = {
        id: 'conv-456',
        seniorId: 'senior-456',
        status: 'in_progress',
        startedAt: new Date(),
        initiatedBy: 'scheduled',
        remindersDelivered: [],
        concerns: [],
      };

      (mockRepository.create as any).mockResolvedValue(mockConversation);

      await service.create({
        seniorId: 'senior-456',
        type: 'scheduled',
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          seniorId: 'senior-456',
          initiatedBy: 'scheduled',
        })
      );
    });

    it('should create conversation with callSid when provided', async () => {
      const mockConversation: Conversation = {
        id: 'conv-789',
        seniorId: 'senior-789',
        callSid: 'CA123456',
        status: 'in_progress',
        startedAt: new Date(),
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
      };

      (mockRepository.create as any).mockResolvedValue(mockConversation);

      await service.create({
        seniorId: 'senior-789',
        callSid: 'CA123456',
        type: 'manual',
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          callSid: 'CA123456',
        })
      );
    });
  });

  describe('addTurn', () => {
    it('should save conversation turn', async () => {
      (mockRepository.addTurn as any).mockResolvedValue(undefined);

      await service.addTurn('conv-123', {
        speaker: 'senior',
        content: 'Hello',
        timestamp: new Date(),
      });

      expect(mockRepository.addTurn).toHaveBeenCalledWith(
        'conv-123',
        expect.objectContaining({
          speaker: 'senior',
          content: 'Hello',
        })
      );
    });

    it('should save turn with audio URL', async () => {
      (mockRepository.addTurn as any).mockResolvedValue(undefined);

      await service.addTurn('conv-123', {
        speaker: 'donna',
        content: 'How are you today?',
        audioUrl: 'https://example.com/audio.mp3',
      });

      expect(mockRepository.addTurn).toHaveBeenCalledWith(
        'conv-123',
        expect.objectContaining({
          speaker: 'donna',
          content: 'How are you today?',
          audioUrl: 'https://example.com/audio.mp3',
        })
      );
    });

    it('should save turn with observer signals', async () => {
      (mockRepository.addTurn as any).mockResolvedValue(undefined);

      const observerSignals = {
        shouldDeliverReminder: true,
        shouldEndCall: false,
        detectedIssues: ['confusion'],
      };

      await service.addTurn('conv-123', {
        speaker: 'senior',
        content: 'What day is it?',
        observerSignals,
      });

      expect(mockRepository.addTurn).toHaveBeenCalledWith(
        'conv-123',
        expect.objectContaining({
          observerSignals,
        })
      );
    });
  });

  describe('getHistory', () => {
    it('should return conversation history for senior', async () => {
      const mockConversations: Conversation[] = [
        {
          id: 'conv-1',
          seniorId: 'senior-123',
          startedAt: new Date('2026-01-12'),
          status: 'completed',
          initiatedBy: 'manual',
          remindersDelivered: [],
          concerns: [],
        },
        {
          id: 'conv-2',
          seniorId: 'senior-123',
          startedAt: new Date('2026-01-10'),
          status: 'completed',
          initiatedBy: 'scheduled',
          remindersDelivered: [],
          concerns: [],
        },
      ];

      (mockRepository.findBySeniorId as any).mockResolvedValue(mockConversations);

      const result = await service.getHistory('senior-123', 10);

      expect(result).toHaveLength(2);
      expect(mockRepository.findBySeniorId).toHaveBeenCalledWith('senior-123', 10);
    });

    it('should use default limit when not provided', async () => {
      (mockRepository.findBySeniorId as any).mockResolvedValue([]);

      await service.getHistory('senior-123');

      expect(mockRepository.findBySeniorId).toHaveBeenCalledWith('senior-123', 10);
    });
  });

  describe('getById', () => {
    it('should return conversation with turns', async () => {
      const mockConversation: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
      };

      const mockTurns = [
        {
          speaker: 'donna' as const,
          content: 'Hello!',
          timestamp: new Date(),
        },
        {
          speaker: 'senior' as const,
          content: 'Hi there!',
          timestamp: new Date(),
        },
      ];

      (mockRepository.findById as any).mockResolvedValue(mockConversation);
      (mockRepository.getTurns as any).mockResolvedValue(mockTurns);

      const result = await service.getById('conv-123');

      expect(result.id).toBe('conv-123');
      expect(result.turns).toHaveLength(2);
      expect(mockRepository.findById).toHaveBeenCalledWith('conv-123');
      expect(mockRepository.getTurns).toHaveBeenCalledWith('conv-123');
    });

    it('should throw NotFoundError if conversation not found', async () => {
      (mockRepository.findById as any).mockResolvedValue(null);

      await expect(service.getById('invalid-id')).rejects.toThrow(
        'Conversation with id invalid-id not found'
      );
    });
  });

  describe('getTurns', () => {
    it('should return turns for conversation', async () => {
      const mockTurns = [
        {
          speaker: 'donna' as const,
          content: 'How are you feeling?',
          timestamp: new Date(),
        },
      ];

      (mockRepository.getTurns as any).mockResolvedValue(mockTurns);

      const result = await service.getTurns('conv-123');

      expect(result).toHaveLength(1);
      expect(result[0].speaker).toBe('donna');
      expect(mockRepository.getTurns).toHaveBeenCalledWith('conv-123');
    });
  });

  describe('updateSummary', () => {
    it('should update conversation summary', async () => {
      (mockRepository.update as any).mockResolvedValue({});

      await service.updateSummary('conv-123', 'Discussed health and medication');

      expect(mockRepository.update).toHaveBeenCalledWith('conv-123', {
        summary: 'Discussed health and medication',
        sentiment: undefined,
      });
    });

    it('should update summary with sentiment', async () => {
      (mockRepository.update as any).mockResolvedValue({});

      await service.updateSummary('conv-123', 'Happy conversation', 'positive');

      expect(mockRepository.update).toHaveBeenCalledWith('conv-123', {
        summary: 'Happy conversation',
        sentiment: 'positive',
      });
    });
  });

  describe('flagConcern', () => {
    it('should add concern to conversation', async () => {
      const mockConv: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        concerns: ['Confusion detected'],
        remindersDelivered: [],
      };

      (mockRepository.findById as any).mockResolvedValue(mockConv);
      (mockRepository.update as any).mockResolvedValue({});

      await service.flagConcern('conv-123', 'Fatigue noted');

      expect(mockRepository.update).toHaveBeenCalledWith('conv-123', {
        concerns: ['Confusion detected', 'Fatigue noted'],
      });
    });

    it('should throw NotFoundError if conversation not found', async () => {
      (mockRepository.findById as any).mockResolvedValue(null);

      await expect(service.flagConcern('invalid-id', 'Concern')).rejects.toThrow(
        'Conversation with id invalid-id not found'
      );
    });

    it('should add first concern to empty array', async () => {
      const mockConv: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        concerns: [],
        remindersDelivered: [],
      };

      (mockRepository.findById as any).mockResolvedValue(mockConv);
      (mockRepository.update as any).mockResolvedValue({});

      await service.flagConcern('conv-123', 'First concern');

      expect(mockRepository.update).toHaveBeenCalledWith('conv-123', {
        concerns: ['First concern'],
      });
    });
  });

  describe('markReminderDelivered', () => {
    it('should add reminder to delivered list', async () => {
      const mockConv: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        remindersDelivered: ['rem-1'],
        concerns: [],
      };

      (mockRepository.findById as any).mockResolvedValue(mockConv);
      (mockRepository.update as any).mockResolvedValue({});

      await service.markReminderDelivered('conv-123', 'rem-2');

      expect(mockRepository.update).toHaveBeenCalledWith('conv-123', {
        remindersDelivered: ['rem-1', 'rem-2'],
      });
    });

    it('should throw NotFoundError if conversation not found', async () => {
      (mockRepository.findById as any).mockResolvedValue(null);

      await expect(
        service.markReminderDelivered('invalid-id', 'rem-1')
      ).rejects.toThrow('Conversation with id invalid-id not found');
    });

    it('should add first reminder to empty array', async () => {
      const mockConv: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
      };

      (mockRepository.findById as any).mockResolvedValue(mockConv);
      (mockRepository.update as any).mockResolvedValue({});

      await service.markReminderDelivered('conv-123', 'rem-1');

      expect(mockRepository.update).toHaveBeenCalledWith('conv-123', {
        remindersDelivered: ['rem-1'],
      });
    });
  });

  describe('getRecentContext', () => {
    it('should build context from recent conversations', async () => {
      const mockConversations: Conversation[] = [
        {
          id: 'conv-1',
          seniorId: 'senior-123',
          summary: 'Discussed gardening plans',
          startedAt: new Date('2026-01-12'),
          status: 'completed',
          initiatedBy: 'manual',
          remindersDelivered: [],
          concerns: [],
        },
        {
          id: 'conv-2',
          seniorId: 'senior-123',
          summary: 'Talked about family visit',
          startedAt: new Date('2026-01-10'),
          status: 'completed',
          initiatedBy: 'scheduled',
          remindersDelivered: [],
          concerns: [],
        },
      ];

      (mockRepository.findBySeniorId as any).mockResolvedValue(mockConversations);

      const context = await service.getRecentContext('senior-123', 5);

      expect(context.recentSummaries).toHaveLength(2);
      expect(context.recentSummaries).toContain('Discussed gardening plans');
      expect(context.recentSummaries).toContain('Talked about family visit');
      expect(context.lastCallDate).toEqual(new Date('2026-01-12'));
      expect(mockRepository.findBySeniorId).toHaveBeenCalledWith('senior-123', 5);
    });

    it('should use default limit when not provided', async () => {
      (mockRepository.findBySeniorId as any).mockResolvedValue([]);

      await service.getRecentContext('senior-123');

      expect(mockRepository.findBySeniorId).toHaveBeenCalledWith('senior-123', 5);
    });

    it('should filter out conversations without summaries', async () => {
      const mockConversations: Conversation[] = [
        {
          id: 'conv-1',
          seniorId: 'senior-123',
          summary: 'Valid summary',
          startedAt: new Date(),
          status: 'completed',
          initiatedBy: 'manual',
          remindersDelivered: [],
          concerns: [],
        },
        {
          id: 'conv-2',
          seniorId: 'senior-123',
          startedAt: new Date(),
          status: 'completed',
          initiatedBy: 'manual',
          remindersDelivered: [],
          concerns: [],
        },
      ];

      (mockRepository.findBySeniorId as any).mockResolvedValue(mockConversations);

      const context = await service.getRecentContext('senior-123');

      expect(context.recentSummaries).toHaveLength(1);
      expect(context.recentSummaries[0]).toBe('Valid summary');
    });

    it('should handle empty conversation history', async () => {
      (mockRepository.findBySeniorId as any).mockResolvedValue([]);

      const context = await service.getRecentContext('senior-123');

      expect(context.recentSummaries).toHaveLength(0);
      expect(context.lastCallDate).toBeUndefined();
    });
  });
});
