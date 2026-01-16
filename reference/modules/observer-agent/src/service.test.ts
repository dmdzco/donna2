import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObserverAgentService } from './service';
import type {
  IAnthropicAdapter,
  ObserverAnalysisRequest,
  Senior,
  Turn,
  Reminder,
} from '@donna/shared/interfaces';

describe('ObserverAgentService', () => {
  let service: ObserverAgentService;
  let mockAnthropicAdapter: jest.Mocked<IAnthropicAdapter>;

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
        name: 'John Smith',
        phone: '+1987654321',
        relationship: 'son',
      },
    },
    interests: ['gardening', 'reading'],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const mockReminders: Reminder[] = [
    {
      id: 'rem-1',
      seniorId: 'senior-123',
      type: 'medication',
      title: 'Take morning medication',
      description: 'Blood pressure pill',
      scheduledTime: '09:00',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'rem-2',
      seniorId: 'senior-123',
      type: 'appointment',
      title: 'Doctor appointment',
      description: 'Cardiology checkup at 2pm',
      scheduledDate: new Date('2026-01-15'),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const mockConversationHistory: Turn[] = [
    {
      speaker: 'donna',
      content: 'Hello Margaret! How are you doing today?',
      timestamp: new Date(),
    },
    {
      speaker: 'senior',
      content: 'Oh hello dear, I\'m doing well. Just been reading.',
      timestamp: new Date(),
    },
    {
      speaker: 'donna',
      content: 'That\'s wonderful! What book are you reading?',
      timestamp: new Date(),
    },
    {
      speaker: 'senior',
      content: 'A mystery novel. I love mysteries!',
      timestamp: new Date(),
    },
  ];

  beforeEach(() => {
    mockAnthropicAdapter = {
      sendMessage: vi.fn(),
    } as any;

    service = new ObserverAgentService(mockAnthropicAdapter);
  });

  describe('analyze', () => {
    it('should analyze conversation and return signal', async () => {
      const mockResponse = {
        content: JSON.stringify({
          engagement_level: 'high',
          emotional_state: 'happy and engaged',
          should_deliver_reminder: false,
          should_end_call: false,
          concerns: [],
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockAnthropicAdapter.sendMessage.mockResolvedValue(mockResponse);

      const request: ObserverAnalysisRequest = {
        senior: mockSenior,
        conversationHistory: mockConversationHistory,
        pendingReminders: mockReminders,
        currentTopic: 'reading',
        callDuration: 180, // 3 minutes in seconds
      };

      const signal = await service.analyze(request);

      expect(signal.engagementLevel).toBe('high');
      expect(signal.emotionalState).toBe('positive');
      expect(signal.shouldDeliverReminder).toBe(false);
      expect(signal.shouldEndCall).toBe(false);
      expect(signal.concerns).toEqual([]);
      expect(signal.confidenceScore).toBeGreaterThan(0);
      expect(signal.timestamp).toBeInstanceOf(Date);

      expect(mockAnthropicAdapter.sendMessage).toHaveBeenCalled();
      const [messages, options] = mockAnthropicAdapter.sendMessage.mock.calls[0];
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toContain('Analyze this conversation');
      expect(options.system).toContain('observer monitoring');
      expect(options.system).toContain('Margaret Smith');
      expect(options.maxTokens).toBe(500);
    });

    it('should suggest delivering a reminder', async () => {
      const mockResponse = {
        content: JSON.stringify({
          engagement_level: 'medium',
          emotional_state: 'calm',
          should_deliver_reminder: true,
          reminder_to_deliver: 'Take morning medication',
          suggested_transition: 'You can ask: "By the way, have you taken your morning medication?"',
          should_end_call: false,
          concerns: [],
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockAnthropicAdapter.sendMessage.mockResolvedValue(mockResponse);

      const request: ObserverAnalysisRequest = {
        senior: mockSenior,
        conversationHistory: mockConversationHistory,
        pendingReminders: mockReminders,
        callDuration: 300,
      };

      const signal = await service.analyze(request);

      expect(signal.shouldDeliverReminder).toBe(true);
      expect(signal.reminderToDeliver).toBe('Take morning medication');
      expect(signal.suggestedTransition).toBeDefined();
    });

    it('should detect low engagement and suggest ending call', async () => {
      const mockResponse = {
        content: JSON.stringify({
          engagement_level: 'low',
          emotional_state: 'tired',
          should_deliver_reminder: false,
          should_end_call: true,
          end_call_reason: 'Senior seems tired and giving short responses',
          concerns: ['Senior appears fatigued'],
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockAnthropicAdapter.sendMessage.mockResolvedValue(mockResponse);

      const tiredConversation: Turn[] = [
        { speaker: 'donna', content: 'How are you?', timestamp: new Date() },
        { speaker: 'senior', content: 'Tired.', timestamp: new Date() },
        { speaker: 'donna', content: 'What did you do today?', timestamp: new Date() },
        { speaker: 'senior', content: 'Nothing much.', timestamp: new Date() },
      ];

      const request: ObserverAnalysisRequest = {
        senior: mockSenior,
        conversationHistory: tiredConversation,
        pendingReminders: [],
        callDuration: 120,
      };

      const signal = await service.analyze(request);

      expect(signal.engagementLevel).toBe('low');
      expect(signal.shouldEndCall).toBe(true);
      expect(signal.endCallReason).toBeDefined();
      expect(signal.concerns).toContain('Senior appears fatigued');
    });

    it('should force end call when exceeding max duration', async () => {
      const mockResponse = {
        content: JSON.stringify({
          engagement_level: 'medium',
          emotional_state: 'neutral',
          should_deliver_reminder: false,
          should_end_call: false,
          concerns: [],
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockAnthropicAdapter.sendMessage.mockResolvedValue(mockResponse);

      const request: ObserverAnalysisRequest = {
        senior: mockSenior,
        conversationHistory: mockConversationHistory,
        pendingReminders: [],
        callDuration: 1200, // 20 minutes (exceeds 15min max * 1.2 = 18min)
      };

      const signal = await service.analyze(request);

      // Should override Claude's recommendation
      expect(signal.shouldEndCall).toBe(true);
      expect(signal.endCallReason).toBe('Call duration exceeded recommended time');
    });

    it('should handle confused emotional state', async () => {
      const mockResponse = {
        content: JSON.stringify({
          engagement_level: 'medium',
          emotional_state: 'confused and uncertain',
          should_deliver_reminder: false,
          should_end_call: false,
          concerns: ['Senior seems confused about current topic'],
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockAnthropicAdapter.sendMessage.mockResolvedValue(mockResponse);

      const request: ObserverAnalysisRequest = {
        senior: mockSenior,
        conversationHistory: mockConversationHistory,
        pendingReminders: [],
        callDuration: 60,
      };

      const signal = await service.analyze(request);

      expect(signal.emotionalState).toBe('confused');
      expect(signal.concerns).toContain('Senior seems confused about current topic');
    });

    it('should handle distressed emotional state', async () => {
      const mockResponse = {
        content: JSON.stringify({
          engagement_level: 'high',
          emotional_state: 'distressed and upset',
          should_deliver_reminder: false,
          should_end_call: true,
          end_call_reason: 'Senior is upset, should notify caregiver',
          concerns: ['Senior appears distressed', 'Mentioned feeling unwell'],
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockAnthropicAdapter.sendMessage.mockResolvedValue(mockResponse);

      const request: ObserverAnalysisRequest = {
        senior: mockSenior,
        conversationHistory: mockConversationHistory,
        pendingReminders: [],
        callDuration: 120,
      };

      const signal = await service.analyze(request);

      expect(signal.emotionalState).toBe('distressed');
      expect(signal.shouldEndCall).toBe(true);
      expect(signal.concerns.length).toBeGreaterThan(0);
    });

    it('should include current topic in analysis prompt', async () => {
      const mockResponse = {
        content: JSON.stringify({
          engagement_level: 'high',
          emotional_state: 'engaged',
          should_deliver_reminder: false,
          should_end_call: false,
          concerns: [],
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockAnthropicAdapter.sendMessage.mockResolvedValue(mockResponse);

      const request: ObserverAnalysisRequest = {
        senior: mockSenior,
        conversationHistory: mockConversationHistory,
        pendingReminders: mockReminders,
        currentTopic: 'gardening',
        callDuration: 240,
      };

      await service.analyze(request);

      const systemPrompt = (mockAnthropicAdapter.sendMessage.mock.calls[0][1] as any).system;
      expect(systemPrompt).toContain('CURRENT TOPIC: gardening');
    });

    it('should include pending reminders in analysis prompt', async () => {
      const mockResponse = {
        content: JSON.stringify({
          engagement_level: 'medium',
          emotional_state: 'neutral',
          should_deliver_reminder: false,
          should_end_call: false,
          concerns: [],
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockAnthropicAdapter.sendMessage.mockResolvedValue(mockResponse);

      const request: ObserverAnalysisRequest = {
        senior: mockSenior,
        conversationHistory: mockConversationHistory,
        pendingReminders: mockReminders,
        callDuration: 180,
      };

      await service.analyze(request);

      const systemPrompt = (mockAnthropicAdapter.sendMessage.mock.calls[0][1] as any).system;
      expect(systemPrompt).toContain('Take morning medication');
      expect(systemPrompt).toContain('Doctor appointment');
    });

    it('should handle empty conversation history', async () => {
      const mockResponse = {
        content: JSON.stringify({
          engagement_level: 'low',
          emotional_state: 'neutral',
          should_deliver_reminder: false,
          should_end_call: false,
          concerns: [],
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockAnthropicAdapter.sendMessage.mockResolvedValue(mockResponse);

      const request: ObserverAnalysisRequest = {
        senior: mockSenior,
        conversationHistory: [],
        pendingReminders: [],
        callDuration: 10,
      };

      const signal = await service.analyze(request);

      expect(signal.confidenceScore).toBeLessThan(0.5);
    });

    it('should calculate higher confidence with more conversation turns', async () => {
      const mockResponse = {
        content: JSON.stringify({
          engagement_level: 'high',
          emotional_state: 'positive',
          should_deliver_reminder: false,
          should_end_call: false,
          concerns: [],
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockAnthropicAdapter.sendMessage.mockResolvedValue(mockResponse);

      const longConversation: Turn[] = Array.from({ length: 15 }, (_, i) => ({
        speaker: i % 2 === 0 ? 'donna' : 'senior',
        content: `Turn ${i}`,
        timestamp: new Date(),
      })) as Turn[];

      const request: ObserverAnalysisRequest = {
        senior: mockSenior,
        conversationHistory: longConversation,
        pendingReminders: [],
        callDuration: 600,
      };

      const signal = await service.analyze(request);

      expect(signal.confidenceScore).toBeGreaterThan(0.9);
    });

    it('should return default signal on Anthropic adapter error', async () => {
      mockAnthropicAdapter.sendMessage.mockRejectedValue(new Error('API Error'));

      const request: ObserverAnalysisRequest = {
        senior: mockSenior,
        conversationHistory: mockConversationHistory,
        pendingReminders: [],
        callDuration: 120,
      };

      const signal = await service.analyze(request);

      expect(signal.engagementLevel).toBe('medium');
      expect(signal.emotionalState).toBe('neutral');
      expect(signal.confidenceScore).toBe(0.3);
      expect(signal.concerns).toEqual([]);
    });

    it('should return default signal on invalid JSON response', async () => {
      const mockResponse = {
        content: 'Invalid JSON {{{',
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockAnthropicAdapter.sendMessage.mockResolvedValue(mockResponse);

      const request: ObserverAnalysisRequest = {
        senior: mockSenior,
        conversationHistory: mockConversationHistory,
        pendingReminders: [],
        callDuration: 180,
      };

      const signal = await service.analyze(request);

      expect(signal.engagementLevel).toBe('medium');
      expect(signal.emotionalState).toBe('neutral');
    });

    it('should signal approaching end time', async () => {
      const mockResponse = {
        content: JSON.stringify({
          engagement_level: 'medium',
          emotional_state: 'neutral',
          should_deliver_reminder: false,
          should_end_call: false,
          concerns: [],
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockAnthropicAdapter.sendMessage.mockResolvedValue(mockResponse);

      const request: ObserverAnalysisRequest = {
        senior: mockSenior,
        conversationHistory: mockConversationHistory,
        pendingReminders: [],
        callDuration: 780, // 13 minutes (approaching 15min limit)
      };

      await service.analyze(request);

      const systemPrompt = (mockAnthropicAdapter.sendMessage.mock.calls[0][1] as any).system;
      expect(systemPrompt).toContain('Call is approaching recommended end time');
    });

    it('should default call duration to 0 if not provided', async () => {
      const mockResponse = {
        content: JSON.stringify({
          engagement_level: 'medium',
          emotional_state: 'neutral',
          should_deliver_reminder: false,
          should_end_call: false,
          concerns: [],
        }),
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      mockAnthropicAdapter.sendMessage.mockResolvedValue(mockResponse);

      const request: ObserverAnalysisRequest = {
        senior: mockSenior,
        conversationHistory: mockConversationHistory,
        pendingReminders: [],
        // callDuration not provided
      };

      await service.analyze(request);

      const systemPrompt = (mockAnthropicAdapter.sendMessage.mock.calls[0][1] as any).system;
      expect(systemPrompt).toContain('CALL DURATION: 0 minutes');
    });
  });
});
