import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReminderManagementService } from './service';
import type { IReminderRepository } from './repository';
import type { ISeniorProfiles, Reminder, ReminderData } from '@donna/shared/interfaces';

describe('ReminderManagementService', () => {
  let service: ReminderManagementService;
  let mockRepository: jest.Mocked<IReminderRepository>;
  let mockSeniorProfiles: jest.Mocked<ISeniorProfiles>;

  beforeEach(() => {
    mockRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findBySeniorId: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getPending: vi.fn(),
      markDelivered: vi.fn(),
    };

    mockSeniorProfiles = {
      create: vi.fn(),
      getById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    service = new ReminderManagementService(mockRepository, mockSeniorProfiles);
  });

  describe('create', () => {
    it('should create a reminder for an existing senior', async () => {
      const seniorId = 'senior-123';
      const reminderData: ReminderData = {
        type: 'medication',
        title: 'Take blood pressure medication',
        description: 'Take 1 pill with water',
        scheduledTime: new Date('2026-01-15T09:00:00Z'),
        isRecurring: true,
      };

      const mockSenior = {
        id: seniorId,
        caregiverId: 'caregiver-123',
        name: 'John Doe',
        phone: '+1234567890',
        timezone: 'America/New_York',
        interests: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockReminder: Reminder = {
        id: 'reminder-123',
        seniorId,
        ...reminderData,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSeniorProfiles.getById.mockResolvedValue(mockSenior);
      mockRepository.create.mockResolvedValue(mockReminder);

      const result = await service.create(seniorId, reminderData);

      expect(result).toEqual(mockReminder);
      expect(mockSeniorProfiles.getById).toHaveBeenCalledWith(seniorId);
      expect(mockRepository.create).toHaveBeenCalledWith(seniorId, reminderData);
    });

    it('should throw error if senior does not exist', async () => {
      mockSeniorProfiles.getById.mockResolvedValue(null);

      await expect(
        service.create('invalid-id', {
          type: 'medication',
          title: 'Test',
        })
      ).rejects.toThrow('Senior with id invalid-id not found');
    });

    it('should throw error if title is empty', async () => {
      const mockSenior = {
        id: 'senior-123',
        caregiverId: 'caregiver-123',
        name: 'John Doe',
        phone: '+1234567890',
        timezone: 'America/New_York',
        interests: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSeniorProfiles.getById.mockResolvedValue(mockSenior);

      await expect(
        service.create('senior-123', {
          type: 'medication',
          title: '   ',
        })
      ).rejects.toThrow('Reminder title is required');
    });

    it('should throw error for invalid reminder type', async () => {
      const mockSenior = {
        id: 'senior-123',
        caregiverId: 'caregiver-123',
        name: 'John Doe',
        phone: '+1234567890',
        timezone: 'America/New_York',
        interests: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSeniorProfiles.getById.mockResolvedValue(mockSenior);

      await expect(
        service.create('senior-123', {
          type: 'invalid' as any,
          title: 'Test',
        })
      ).rejects.toThrow('Invalid reminder type');
    });
  });

  describe('list', () => {
    it('should list all reminders for a senior', async () => {
      const seniorId = 'senior-123';
      const mockReminders: Reminder[] = [
        {
          id: 'reminder-1',
          seniorId,
          type: 'medication',
          title: 'Take medication',
          isRecurring: true,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'reminder-2',
          seniorId,
          type: 'appointment',
          title: 'Doctor appointment',
          isRecurring: false,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRepository.findBySeniorId.mockResolvedValue(mockReminders);

      const result = await service.list(seniorId);

      expect(result).toEqual(mockReminders);
      expect(mockRepository.findBySeniorId).toHaveBeenCalledWith(seniorId, undefined);
    });

    it('should list reminders with filters', async () => {
      const seniorId = 'senior-123';
      const filters = { type: 'medication' as const, isActive: true };

      const mockReminders: Reminder[] = [
        {
          id: 'reminder-1',
          seniorId,
          type: 'medication',
          title: 'Take medication',
          isRecurring: true,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRepository.findBySeniorId.mockResolvedValue(mockReminders);

      const result = await service.list(seniorId, filters);

      expect(result).toEqual(mockReminders);
      expect(mockRepository.findBySeniorId).toHaveBeenCalledWith(seniorId, filters);
    });
  });

  describe('update', () => {
    it('should update a reminder', async () => {
      const reminderId = 'reminder-123';
      const updateData = { title: 'Updated title', description: 'Updated description' };

      const existingReminder: Reminder = {
        id: reminderId,
        seniorId: 'senior-123',
        type: 'medication',
        title: 'Old title',
        isRecurring: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedReminder: Reminder = {
        ...existingReminder,
        ...updateData,
        updatedAt: new Date(),
      };

      mockRepository.findById.mockResolvedValue(existingReminder);
      mockRepository.update.mockResolvedValue(updatedReminder);

      const result = await service.update(reminderId, updateData);

      expect(result).toEqual(updatedReminder);
      expect(mockRepository.findById).toHaveBeenCalledWith(reminderId);
      expect(mockRepository.update).toHaveBeenCalledWith(reminderId, updateData);
    });

    it('should throw error if reminder not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('invalid-id', { title: 'Test' })
      ).rejects.toThrow('Reminder with id invalid-id not found');
    });

    it('should throw error for invalid type update', async () => {
      const existingReminder: Reminder = {
        id: 'reminder-123',
        seniorId: 'senior-123',
        type: 'medication',
        title: 'Test',
        isRecurring: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findById.mockResolvedValue(existingReminder);

      await expect(
        service.update('reminder-123', { type: 'invalid' as any })
      ).rejects.toThrow('Invalid reminder type');
    });
  });

  describe('delete', () => {
    it('should delete a reminder', async () => {
      const reminderId = 'reminder-123';

      const existingReminder: Reminder = {
        id: reminderId,
        seniorId: 'senior-123',
        type: 'medication',
        title: 'Test',
        isRecurring: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findById.mockResolvedValue(existingReminder);
      mockRepository.delete.mockResolvedValue();

      await service.delete(reminderId);

      expect(mockRepository.findById).toHaveBeenCalledWith(reminderId);
      expect(mockRepository.delete).toHaveBeenCalledWith(reminderId);
    });

    it('should throw error if reminder not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.delete('invalid-id')).rejects.toThrow(
        'Reminder with id invalid-id not found'
      );
    });
  });

  describe('getPendingForSenior', () => {
    it('should get pending reminders for a senior', async () => {
      const seniorId = 'senior-123';
      const mockPendingReminders: Reminder[] = [
        {
          id: 'reminder-1',
          seniorId,
          type: 'medication',
          title: 'Take medication',
          scheduledTime: new Date('2026-01-14T09:00:00Z'),
          isRecurring: true,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRepository.getPending.mockResolvedValue(mockPendingReminders);

      const result = await service.getPendingForSenior(seniorId);

      expect(result).toEqual(mockPendingReminders);
      expect(mockRepository.getPending).toHaveBeenCalledWith(seniorId);
    });
  });

  describe('markDelivered', () => {
    it('should mark a reminder as delivered', async () => {
      const reminderId = 'reminder-123';
      const conversationId = 'conv-123';

      const existingReminder: Reminder = {
        id: reminderId,
        seniorId: 'senior-123',
        type: 'medication',
        title: 'Test',
        isRecurring: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findById.mockResolvedValue(existingReminder);
      mockRepository.markDelivered.mockResolvedValue();

      await service.markDelivered(reminderId, conversationId);

      expect(mockRepository.findById).toHaveBeenCalledWith(reminderId);
      expect(mockRepository.markDelivered).toHaveBeenCalledWith(reminderId, conversationId);
    });

    it('should throw error if reminder not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        service.markDelivered('invalid-id', 'conv-123')
      ).rejects.toThrow('Reminder with id invalid-id not found');
    });
  });

  describe('getDeliveryHistory', () => {
    it('should return delivery history for a reminder with last delivery', async () => {
      const reminderId = 'reminder-123';
      const lastDeliveredAt = new Date('2026-01-14T10:00:00Z');

      const existingReminder: Reminder = {
        id: reminderId,
        seniorId: 'senior-123',
        type: 'medication',
        title: 'Test',
        isRecurring: false,
        isActive: true,
        lastDeliveredAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findById.mockResolvedValue(existingReminder);

      const result = await service.getDeliveryHistory(reminderId);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        reminderId,
        deliveredAt: lastDeliveredAt,
        acknowledged: true,
      });
    });

    it('should return empty array if reminder never delivered', async () => {
      const reminderId = 'reminder-123';

      const existingReminder: Reminder = {
        id: reminderId,
        seniorId: 'senior-123',
        type: 'medication',
        title: 'Test',
        isRecurring: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findById.mockResolvedValue(existingReminder);

      const result = await service.getDeliveryHistory(reminderId);

      expect(result).toEqual([]);
    });

    it('should throw error if reminder not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.getDeliveryHistory('invalid-id')).rejects.toThrow(
        'Reminder with id invalid-id not found'
      );
    });
  });
});
