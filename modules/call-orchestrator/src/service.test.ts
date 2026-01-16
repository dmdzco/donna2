import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallOrchestratorService } from './service';
import type {
  ITwilioAdapter,
  IConversationManager,
  ISeniorProfiles,
  Senior,
  Conversation,
  CallEvent,
} from '@donna/shared/interfaces';

describe('CallOrchestratorService', () => {
  let service: CallOrchestratorService;
  let mockTwilio: ITwilioAdapter;
  let mockConversationMgr: IConversationManager;
  let mockSeniorProfiles: ISeniorProfiles;

  beforeEach(() => {
    mockTwilio = {
      initiateCall: vi.fn(),
      endCall: vi.fn(),
      getCallStatus: vi.fn(),
      getCallDetails: vi.fn(),
    };

    mockConversationMgr = {
      create: vi.fn(),
      addTurn: vi.fn(),
      getHistory: vi.fn(),
      getById: vi.fn(),
      getTurns: vi.fn(),
      updateSummary: vi.fn(),
      flagConcern: vi.fn(),
      markReminderDelivered: vi.fn(),
      getRecentContext: vi.fn(),
    };

    mockSeniorProfiles = {
      create: vi.fn(),
      getById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getPreferences: vi.fn(),
      updatePreferences: vi.fn(),
    };

    service = new CallOrchestratorService(
      mockTwilio,
      mockConversationMgr,
      mockSeniorProfiles,
      'https://api.example.com'
    );
  });

  describe('initiateCall', () => {
    it('should orchestrate full call initialization', async () => {
      const mockSenior: Senior = {
        id: 'senior-123',
        caregiverId: 'caregiver-1',
        phone: '+10987654321',
        name: 'John Doe',
        timezone: 'America/New_York',
        interests: [],
        isActive: true,
      };

      const mockConversation: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
      };

      (mockSeniorProfiles.getById as any).mockResolvedValue(mockSenior);
      (mockConversationMgr.create as any).mockResolvedValue(mockConversation);
      (mockTwilio.initiateCall as any).mockResolvedValue('CA123456');
      (mockConversationMgr.updateSummary as any).mockResolvedValue(undefined);

      const call = await service.initiateCall({
        seniorId: 'senior-123',
        type: 'manual',
        reminderIds: [],
      });

      expect(call.callSid).toBe('CA123456');
      expect(call.status).toBe('initiating');
      expect(call.seniorId).toBe('senior-123');
      expect(mockSeniorProfiles.getById).toHaveBeenCalledWith('senior-123');
      expect(mockConversationMgr.create).toHaveBeenCalledWith({
        seniorId: 'senior-123',
        type: 'manual',
        reminderIds: [],
      });
      expect(mockTwilio.initiateCall).toHaveBeenCalledWith(
        '+10987654321',
        '',
        'https://api.example.com/api/voice/connect'
      );
    });

    it('should include reminder IDs in conversation metadata', async () => {
      const mockSenior: Senior = {
        id: 'senior-456',
        caregiverId: 'caregiver-1',
        phone: '+11234567890',
        name: 'Jane Smith',
        timezone: 'America/Los_Angeles',
        interests: [],
        isActive: true,
      };

      const mockConversation: Conversation = {
        id: 'conv-456',
        seniorId: 'senior-456',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'scheduled',
        remindersDelivered: [],
        concerns: [],
      };

      (mockSeniorProfiles.getById as any).mockResolvedValue(mockSenior);
      (mockConversationMgr.create as any).mockResolvedValue(mockConversation);
      (mockTwilio.initiateCall as any).mockResolvedValue('CA456789');
      (mockConversationMgr.updateSummary as any).mockResolvedValue(undefined);

      await service.initiateCall({
        seniorId: 'senior-456',
        type: 'scheduled',
        reminderIds: ['rem-1', 'rem-2'],
      });

      expect(mockConversationMgr.create).toHaveBeenCalledWith({
        seniorId: 'senior-456',
        type: 'scheduled',
        reminderIds: ['rem-1', 'rem-2'],
      });
    });

    it('should throw if senior not found', async () => {
      (mockSeniorProfiles.getById as any).mockRejectedValue(
        new Error('Senior with id invalid not found')
      );

      await expect(
        service.initiateCall({ seniorId: 'invalid', type: 'manual' })
      ).rejects.toThrow('Senior with id invalid not found');
    });

    it('should handle Twilio initiate call failure', async () => {
      const mockSenior: Senior = {
        id: 'senior-123',
        caregiverId: 'caregiver-1',
        phone: '+10987654321',
        name: 'John Doe',
        timezone: 'America/New_York',
        interests: [],
        isActive: true,
      };

      const mockConversation: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
      };

      (mockSeniorProfiles.getById as any).mockResolvedValue(mockSenior);
      (mockConversationMgr.create as any).mockResolvedValue(mockConversation);
      (mockTwilio.initiateCall as any).mockRejectedValue(
        new Error('External service Twilio error: Invalid phone number')
      );

      await expect(
        service.initiateCall({ seniorId: 'senior-123', type: 'manual' })
      ).rejects.toThrow('External service Twilio error');
    });
  });

  describe('getCallStatus', () => {
    it('should return status from active call', async () => {
      const mockSenior: Senior = {
        id: 'senior-123',
        caregiverId: 'caregiver-1',
        phone: '+10987654321',
        name: 'John Doe',
        timezone: 'America/New_York',
        interests: [],
        isActive: true,
      };

      const mockConversation: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
      };

      (mockSeniorProfiles.getById as any).mockResolvedValue(mockSenior);
      (mockConversationMgr.create as any).mockResolvedValue(mockConversation);
      (mockTwilio.initiateCall as any).mockResolvedValue('CA123456');
      (mockConversationMgr.updateSummary as any).mockResolvedValue(undefined);

      const call = await service.initiateCall({
        seniorId: 'senior-123',
        type: 'manual',
      });

      const status = await service.getCallStatus(call.id);

      expect(status).toBe('initiating');
    });

    it('should fetch from conversation manager if not in active calls', async () => {
      const mockConversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        status: 'completed',
        startedAt: new Date(),
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
        turns: [],
      };

      (mockConversationMgr.getById as any).mockResolvedValue(mockConversation);

      const status = await service.getCallStatus('conv-123');

      expect(status).toBe('completed');
      expect(mockConversationMgr.getById).toHaveBeenCalledWith('conv-123');
    });
  });

  describe('endCall', () => {
    it('should end call and update conversation', async () => {
      const mockSenior: Senior = {
        id: 'senior-123',
        caregiverId: 'caregiver-1',
        phone: '+10987654321',
        name: 'John Doe',
        timezone: 'America/New_York',
        interests: [],
        isActive: true,
      };

      const mockConversation: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        callSid: 'CA123456',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
      };

      (mockSeniorProfiles.getById as any).mockResolvedValue(mockSenior);
      (mockConversationMgr.create as any).mockResolvedValue(mockConversation);
      (mockTwilio.initiateCall as any).mockResolvedValue('CA123456');
      (mockConversationMgr.updateSummary as any).mockResolvedValue(undefined);
      (mockTwilio.endCall as any).mockResolvedValue(undefined);
      (mockTwilio.getCallDetails as any).mockResolvedValue({
        duration: 120,
        status: 'completed',
      });
      (mockConversationMgr.getById as any).mockResolvedValue({
        ...mockConversation,
        turns: [],
      });

      const call = await service.initiateCall({
        seniorId: 'senior-123',
        type: 'manual',
      });

      await service.endCall(call.id, 'User requested');

      expect(mockTwilio.endCall).toHaveBeenCalledWith('CA123456');
      expect(mockTwilio.getCallDetails).toHaveBeenCalledWith('CA123456');
    });

    it('should throw if call not found', async () => {
      await expect(service.endCall('invalid-id')).rejects.toThrow(
        'Call with id invalid-id not found'
      );
    });
  });

  describe('handleCallEvent', () => {
    it('should update conversation status on call answered', async () => {
      const mockSenior: Senior = {
        id: 'senior-123',
        caregiverId: 'caregiver-1',
        phone: '+10987654321',
        name: 'John Doe',
        timezone: 'America/New_York',
        interests: [],
        isActive: true,
      };

      const mockConversation: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
      };

      (mockSeniorProfiles.getById as any).mockResolvedValue(mockSenior);
      (mockConversationMgr.create as any).mockResolvedValue(mockConversation);
      (mockTwilio.initiateCall as any).mockResolvedValue('CA123456');
      (mockConversationMgr.updateSummary as any).mockResolvedValue(undefined);

      const call = await service.initiateCall({
        seniorId: 'senior-123',
        type: 'manual',
      });

      const event: CallEvent = {
        callId: call.id,
        callSid: call.callSid,
        type: 'answered',
        timestamp: new Date(),
      };

      await service.handleCallEvent(event);

      const status = await service.getCallStatus(call.id);
      expect(status).toBe('answered');
    });

    it('should update status to failed on failed event', async () => {
      const mockSenior: Senior = {
        id: 'senior-123',
        caregiverId: 'caregiver-1',
        phone: '+10987654321',
        name: 'John Doe',
        timezone: 'America/New_York',
        interests: [],
        isActive: true,
      };

      const mockConversation: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
      };

      (mockSeniorProfiles.getById as any).mockResolvedValue(mockSenior);
      (mockConversationMgr.create as any).mockResolvedValue(mockConversation);
      (mockTwilio.initiateCall as any).mockResolvedValue('CA123456');
      (mockConversationMgr.updateSummary as any).mockResolvedValue(undefined);

      const call = await service.initiateCall({
        seniorId: 'senior-123',
        type: 'manual',
      });

      await service.handleCallEvent({
        callId: call.id,
        callSid: call.callSid,
        type: 'failed',
        timestamp: new Date(),
      });

      const status = await service.getCallStatus(call.id);
      expect(status).toBe('failed');
    });

    it('should handle no_answer event', async () => {
      const mockSenior: Senior = {
        id: 'senior-123',
        caregiverId: 'caregiver-1',
        phone: '+10987654321',
        name: 'John Doe',
        timezone: 'America/New_York',
        interests: [],
        isActive: true,
      };

      const mockConversation: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
      };

      (mockSeniorProfiles.getById as any).mockResolvedValue(mockSenior);
      (mockConversationMgr.create as any).mockResolvedValue(mockConversation);
      (mockTwilio.initiateCall as any).mockResolvedValue('CA123456');
      (mockConversationMgr.updateSummary as any).mockResolvedValue(undefined);

      const call = await service.initiateCall({
        seniorId: 'senior-123',
        type: 'manual',
      });

      await service.handleCallEvent({
        callId: call.id,
        callSid: call.callSid,
        type: 'no_answer',
        timestamp: new Date(),
      });

      const status = await service.getCallStatus(call.id);
      expect(status).toBe('no_answer');
    });
  });

  describe('event handlers', () => {
    it('should trigger registered event handlers on call answered', async () => {
      const mockSenior: Senior = {
        id: 'senior-123',
        caregiverId: 'caregiver-1',
        phone: '+10987654321',
        name: 'John Doe',
        timezone: 'America/New_York',
        interests: [],
        isActive: true,
      };

      const mockConversation: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
      };

      (mockSeniorProfiles.getById as any).mockResolvedValue(mockSenior);
      (mockConversationMgr.create as any).mockResolvedValue(mockConversation);
      (mockTwilio.initiateCall as any).mockResolvedValue('CA123456');
      (mockConversationMgr.updateSummary as any).mockResolvedValue(undefined);

      const call = await service.initiateCall({
        seniorId: 'senior-123',
        type: 'manual',
      });

      const handler = vi.fn();
      service.onCallAnswered(call.id, handler);

      await service.handleCallEvent({
        callId: call.id,
        callSid: call.callSid,
        type: 'answered',
        timestamp: new Date(),
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: call.id,
          status: 'answered',
        })
      );
    });

    it('should trigger multiple handlers for same event', async () => {
      const mockSenior: Senior = {
        id: 'senior-123',
        caregiverId: 'caregiver-1',
        phone: '+10987654321',
        name: 'John Doe',
        timezone: 'America/New_York',
        interests: [],
        isActive: true,
      };

      const mockConversation: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
      };

      (mockSeniorProfiles.getById as any).mockResolvedValue(mockSenior);
      (mockConversationMgr.create as any).mockResolvedValue(mockConversation);
      (mockTwilio.initiateCall as any).mockResolvedValue('CA123456');
      (mockConversationMgr.updateSummary as any).mockResolvedValue(undefined);

      const call = await service.initiateCall({
        seniorId: 'senior-123',
        type: 'manual',
      });

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      service.onCallEnded(call.id, handler1);
      service.onCallEnded(call.id, handler2);

      await service.handleCallEvent({
        callId: call.id,
        callSid: call.callSid,
        type: 'ended',
        timestamp: new Date(),
      });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should trigger failed handlers', async () => {
      const mockSenior: Senior = {
        id: 'senior-123',
        caregiverId: 'caregiver-1',
        phone: '+10987654321',
        name: 'John Doe',
        timezone: 'America/New_York',
        interests: [],
        isActive: true,
      };

      const mockConversation: Conversation = {
        id: 'conv-123',
        seniorId: 'senior-123',
        startedAt: new Date(),
        status: 'in_progress',
        initiatedBy: 'manual',
        remindersDelivered: [],
        concerns: [],
      };

      (mockSeniorProfiles.getById as any).mockResolvedValue(mockSenior);
      (mockConversationMgr.create as any).mockResolvedValue(mockConversation);
      (mockTwilio.initiateCall as any).mockResolvedValue('CA123456');
      (mockConversationMgr.updateSummary as any).mockResolvedValue(undefined);

      const call = await service.initiateCall({
        seniorId: 'senior-123',
        type: 'manual',
      });

      const failedHandler = vi.fn();
      service.onCallFailed(call.id, failedHandler);

      await service.handleCallEvent({
        callId: call.id,
        callSid: call.callSid,
        type: 'failed',
        timestamp: new Date(),
      });

      expect(failedHandler).toHaveBeenCalled();
    });
  });
});
