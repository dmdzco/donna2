import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryContextService } from './service';
import type {
  IMemoryRepository,
  IConversationManager,
  ISeniorProfiles,
  IEmbeddingAdapter,
  Senior,
  Memory,
  MemoryData,
} from '@donna/shared/interfaces';

describe('MemoryContextService', () => {
  let service: MemoryContextService;
  let mockRepository: jest.Mocked<IMemoryRepository>;
  let mockConversationManager: jest.Mocked<IConversationManager>;
  let mockSeniorProfiles: jest.Mocked<ISeniorProfiles>;
  let mockEmbeddingAdapter: jest.Mocked<IEmbeddingAdapter>;

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
    interests: ['gardening', 'reading'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMemory: Memory = {
    id: 'mem-1',
    seniorId: 'senior-123',
    type: 'preference',
    content: 'Prefers tea over coffee',
    source: 'conv-123',
    timestamp: new Date(),
    importance: 0.8,
    metadata: {},
  };

  beforeEach(() => {
    mockRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findBySeniorId: vi.fn(),
      delete: vi.fn(),
      searchByContent: vi.fn(),
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

    mockSeniorProfiles = {
      create: vi.fn(),
      getById: vi.fn(),
      getAll: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getPreferences: vi.fn().mockResolvedValue({}),
    } as any;

    mockEmbeddingAdapter = {
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    } as any;

    service = new MemoryContextService(
      mockRepository,
      mockConversationManager,
      mockSeniorProfiles,
      mockEmbeddingAdapter
    );
  });

  describe('storeMemory', () => {
    it('should store a new memory', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(mockSenior);
      mockRepository.create.mockResolvedValue(mockMemory);

      const memoryData: MemoryData = {
        type: 'preference',
        content: 'Prefers tea over coffee',
        source: 'conv-123',
        importance: 0.8,
      };

      const result = await service.storeMemory('senior-123', memoryData);

      expect(result).toEqual(mockMemory);
      expect(mockSeniorProfiles.getById).toHaveBeenCalledWith('senior-123');
      expect(mockEmbeddingAdapter.generateEmbedding).toHaveBeenCalledWith('Prefers tea over coffee');
      expect(mockRepository.create).toHaveBeenCalledWith('senior-123', {
        ...memoryData,
        embedding: [0.1, 0.2, 0.3],
      });
    });

    it('should throw error if senior not found', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(null);

      const memoryData: MemoryData = {
        type: 'fact',
        content: 'Test fact',
        source: 'manual',
      };

      await expect(service.storeMemory('invalid-id', memoryData)).rejects.toThrow(
        'Senior with id invalid-id not found'
      );
    });

    it('should throw error if memory content is empty', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(mockSenior);

      const memoryData: MemoryData = {
        type: 'fact',
        content: '   ',
        source: 'manual',
      };

      await expect(service.storeMemory('senior-123', memoryData)).rejects.toThrow(
        'Memory content is required'
      );
    });

    it('should throw error if memory type is invalid', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(mockSenior);

      const memoryData: MemoryData = {
        type: 'invalid' as any,
        content: 'Test content',
        source: 'manual',
      };

      await expect(service.storeMemory('senior-123', memoryData)).rejects.toThrow(
        'Invalid memory type'
      );
    });

    it('should store all valid memory types', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(mockSenior);
      mockRepository.create.mockResolvedValue(mockMemory);

      const types: Array<'fact' | 'preference' | 'event' | 'concern'> = [
        'fact',
        'preference',
        'event',
        'concern',
      ];

      for (const type of types) {
        await service.storeMemory('senior-123', {
          type,
          content: `Test ${type}`,
          source: 'manual',
        });
      }

      expect(mockRepository.create).toHaveBeenCalledTimes(4);
    });
  });

  describe('getMemories', () => {
    it('should get all memories for a senior', async () => {
      const memories = [mockMemory];
      mockRepository.findBySeniorId.mockResolvedValue(memories);

      const result = await service.getMemories('senior-123');

      expect(result).toEqual(memories);
      expect(mockRepository.findBySeniorId).toHaveBeenCalledWith('senior-123', undefined);
    });

    it('should get filtered memories', async () => {
      const memories = [mockMemory];
      mockRepository.findBySeniorId.mockResolvedValue(memories);

      const filters = {
        type: 'preference' as const,
        minImportance: 0.7,
        limit: 10,
      };

      const result = await service.getMemories('senior-123', filters);

      expect(result).toEqual(memories);
      expect(mockRepository.findBySeniorId).toHaveBeenCalledWith('senior-123', filters);
    });
  });

  describe('searchMemories', () => {
    it('should search memories by query', async () => {
      const memories = [mockMemory];
      mockRepository.searchByContent.mockResolvedValue(memories);

      const result = await service.searchMemories('senior-123', 'tea');

      expect(result).toEqual(memories);
      expect(mockRepository.searchByContent).toHaveBeenCalledWith('senior-123', 'tea', 10);
    });

    it('should trim search query', async () => {
      mockRepository.searchByContent.mockResolvedValue([]);

      await service.searchMemories('senior-123', '  tea  ', 5);

      expect(mockRepository.searchByContent).toHaveBeenCalledWith('senior-123', 'tea', 5);
    });

    it('should throw error if query is empty', async () => {
      await expect(service.searchMemories('senior-123', '')).rejects.toThrow(
        'Search query is required'
      );

      await expect(service.searchMemories('senior-123', '   ')).rejects.toThrow(
        'Search query is required'
      );
    });
  });

  describe('deleteMemory', () => {
    it('should delete a memory', async () => {
      mockRepository.findById.mockResolvedValue(mockMemory);
      mockRepository.delete.mockResolvedValue();

      await service.deleteMemory('mem-1');

      expect(mockRepository.findById).toHaveBeenCalledWith('mem-1');
      expect(mockRepository.delete).toHaveBeenCalledWith('mem-1');
    });

    it('should throw error if memory not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.deleteMemory('invalid-id')).rejects.toThrow(
        'Memory with id invalid-id not found'
      );
    });
  });

  describe('buildContext', () => {
    it('should build full conversation context', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(mockSenior);
      mockConversationManager.getRecentContext.mockResolvedValue({
        recentSummaries: ['Talked about gardening'],
        lastCallDate: new Date('2026-01-10'),
      });
      mockRepository.findBySeniorId.mockResolvedValue([mockMemory]);

      const context = await service.buildContext('senior-123');

      expect(context.preferences).toEqual(mockSenior.preferences);
      expect(context.recentSummaries).toHaveLength(1);
      expect(context.importantMemories).toHaveLength(1);
      expect(context.lastCallDate).toBeInstanceOf(Date);
    });

    it('should respect scope options', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(mockSenior);

      const context = await service.buildContext('senior-123', {
        includeSummaries: false,
        includeMemories: false,
        includeTopics: false,
      });

      expect(context.recentSummaries).toEqual([]);
      expect(context.importantMemories).toEqual([]);
      expect(mockConversationManager.getRecentContext).not.toHaveBeenCalled();
      expect(mockRepository.findBySeniorId).not.toHaveBeenCalled();
    });

    it('should use custom daysBack parameter', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(mockSenior);
      mockConversationManager.getRecentContext.mockResolvedValue({
        recentSummaries: [],
        lastCallDate: undefined,
      });
      mockRepository.findBySeniorId.mockResolvedValue([]);

      await service.buildContext('senior-123', {
        daysBack: 30,
      });

      const callArgs = mockRepository.findBySeniorId.mock.calls[0];
      const filters = callArgs[1];
      expect(filters?.since).toBeInstanceOf(Date);
    });

    it('should throw error if senior not found', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(null);

      await expect(service.buildContext('invalid-id')).rejects.toThrow(
        'Senior with id invalid-id not found'
      );
    });
  });

  describe('summarizeConversation', () => {
    it('should summarize a conversation', async () => {
      const mockConversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date('2026-01-14T10:00:00Z'),
        endedAt: new Date('2026-01-14T10:05:00Z'),
      };

      const mockTurns = [
        { speaker: 'donna', content: 'Hello! How are you?', timestamp: new Date() },
        { speaker: 'senior', content: 'I\'m good, working in my garden.', timestamp: new Date() },
        { speaker: 'donna', content: 'That sounds lovely!', timestamp: new Date() },
      ];

      mockConversationManager.getById.mockResolvedValue(mockConversation as any);
      mockConversationManager.getTurns.mockResolvedValue(mockTurns as any);

      const summary = await service.summarizeConversation('conv-123');

      expect(summary).toContain('3 turns');
      expect(summary).toContain('5 minutes');
      expect(mockConversationManager.getById).toHaveBeenCalledWith('conv-123');
      expect(mockConversationManager.getTurns).toHaveBeenCalledWith('conv-123');
    });

    it('should handle conversation with no turns', async () => {
      const mockConversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
      };

      mockConversationManager.getById.mockResolvedValue(mockConversation as any);
      mockConversationManager.getTurns.mockResolvedValue([]);

      const summary = await service.summarizeConversation('conv-123');

      expect(summary).toBe('No conversation recorded.');
    });

    it('should throw error if conversation not found', async () => {
      mockConversationManager.getById.mockResolvedValue(null);

      await expect(service.summarizeConversation('invalid-id')).rejects.toThrow(
        'Conversation with id invalid-id not found'
      );
    });
  });

  describe('getRecentTopics', () => {
    it('should extract topics from recent memories', async () => {
      const topicMemories: Memory[] = [
        {
          ...mockMemory,
          type: 'event',
          content: 'Discussed gardening',
          metadata: { topic: 'gardening' },
        },
        {
          ...mockMemory,
          id: 'mem-2',
          type: 'event',
          content: 'Discussed family',
          metadata: { topic: 'family' },
        },
      ];

      mockRepository.findBySeniorId.mockResolvedValue(topicMemories);

      const topics = await service.getRecentTopics('senior-123', 7);

      expect(topics).toEqual(['gardening', 'family']);
    });

    it('should remove duplicate topics', async () => {
      const topicMemories: Memory[] = [
        {
          ...mockMemory,
          type: 'event',
          metadata: { topic: 'gardening' },
        },
        {
          ...mockMemory,
          id: 'mem-2',
          type: 'event',
          metadata: { topic: 'gardening' },
        },
      ];

      mockRepository.findBySeniorId.mockResolvedValue(topicMemories);

      const topics = await service.getRecentTopics('senior-123', 7);

      expect(topics).toEqual(['gardening']);
    });

    it('should handle memories without topics', async () => {
      mockRepository.findBySeniorId.mockResolvedValue([mockMemory]);

      const topics = await service.getRecentTopics('senior-123', 7);

      expect(topics).toEqual([]);
    });
  });

  describe('trackTopic', () => {
    it('should create a topic memory', async () => {
      mockRepository.create.mockResolvedValue({
        ...mockMemory,
        type: 'event',
        content: 'Discussed gardening',
        metadata: { topic: 'gardening' },
      });

      await service.trackTopic('senior-123', 'gardening', 'conv-123');

      expect(mockRepository.create).toHaveBeenCalledWith('senior-123', {
        type: 'event',
        content: 'Discussed gardening',
        source: 'conv-123',
        importance: 0.3,
        metadata: { topic: 'gardening' },
      });
    });
  });
});
