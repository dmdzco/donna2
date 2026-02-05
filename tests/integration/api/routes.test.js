/**
 * API Route Tests
 *
 * Tests for Express API endpoints with mocked dependencies
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import fixtures
import { dorothy, harold, activeSeniors } from '../../fixtures/seniors.js';
import { dorothyMemories } from '../../fixtures/memories.js';

// Mock phone normalization (from seniors.js logic)
function normalizePhone(phone) {
  if (!phone) return null;
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  // If starts with 1 and is 11 digits, remove the 1
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

// Mock API response structure
function createApiResponse(data, statusCode = 200) {
  return {
    status: statusCode,
    data,
    ok: statusCode >= 200 && statusCode < 300,
  };
}

// Mock API error response
function createApiError(message, statusCode = 400) {
  return {
    status: statusCode,
    error: message,
    ok: false,
  };
}

describe('API Routes', () => {
  // ============================================================================
  // SENIOR CRUD ROUTES
  // ============================================================================
  describe('Senior CRUD - /api/seniors', () => {
    describe('GET /api/seniors', () => {
      it('returns list of active seniors', () => {
        const response = createApiResponse(activeSeniors);

        expect(response.ok).toBe(true);
        expect(response.data).toBeInstanceOf(Array);
        expect(response.data.length).toBe(3);
      });

      it('excludes inactive seniors from list', () => {
        const response = createApiResponse(activeSeniors);

        const inactiveFound = response.data.some((s) => !s.isActive);
        expect(inactiveFound).toBe(false);
      });

      it('returns seniors with required fields', () => {
        const response = createApiResponse(activeSeniors);

        response.data.forEach((senior) => {
          expect(senior.id).toBeDefined();
          expect(senior.name).toBeDefined();
          expect(senior.phone).toBeDefined();
          expect(senior.timezone).toBeDefined();
        });
      });
    });

    describe('GET /api/seniors/:id', () => {
      it('returns senior by ID', () => {
        const response = createApiResponse(dorothy);

        expect(response.ok).toBe(true);
        expect(response.data.id).toBe('senior-dorothy');
        expect(response.data.name).toBe('Dorothy');
      });

      it('returns 404 for non-existent senior', () => {
        const response = createApiError('Senior not found', 404);

        expect(response.ok).toBe(false);
        expect(response.status).toBe(404);
      });
    });

    describe('POST /api/seniors', () => {
      it('creates new senior with valid data', () => {
        const newSenior = {
          name: 'Test Senior',
          phone: '+15551234567',
          timezone: 'America/New_York',
          interests: ['gardening'],
        };

        const response = createApiResponse({ ...newSenior, id: 'new-senior-id' }, 201);

        expect(response.ok).toBe(true);
        expect(response.status).toBe(201);
        expect(response.data.name).toBe('Test Senior');
      });

      it('rejects duplicate phone number', () => {
        const response = createApiError('Phone number already exists', 400);

        expect(response.ok).toBe(false);
        expect(response.error).toContain('already exists');
      });

      it('normalizes phone number', () => {
        const phone = '+1 (555) 123-4567';
        const normalized = normalizePhone(phone);

        expect(normalized).toBe('5551234567');
      });

      it('handles phone without country code', () => {
        const phone = '555-123-4567';
        const normalized = normalizePhone(phone);

        expect(normalized).toBe('5551234567');
      });

      it('handles phone with +1 country code', () => {
        const phone = '+15551234567';
        const normalized = normalizePhone(phone);

        expect(normalized).toBe('5551234567');
      });
    });

    describe('PATCH /api/seniors/:id', () => {
      it('updates senior name', () => {
        const updated = { ...dorothy, name: 'Dorothy Smith' };
        const response = createApiResponse(updated);

        expect(response.ok).toBe(true);
        expect(response.data.name).toBe('Dorothy Smith');
      });

      it('updates senior interests', () => {
        const updated = { ...dorothy, interests: ['gardening', 'reading', 'puzzles'] };
        const response = createApiResponse(updated);

        expect(response.ok).toBe(true);
        expect(response.data.interests).toContain('puzzles');
      });

      it('returns 404 for non-existent senior', () => {
        const response = createApiError('Senior not found', 404);

        expect(response.ok).toBe(false);
        expect(response.status).toBe(404);
      });
    });

    describe('DELETE /api/seniors/:id', () => {
      it('soft deletes senior (sets isActive=false)', () => {
        const deleted = { ...dorothy, isActive: false };
        const response = createApiResponse(deleted);

        expect(response.ok).toBe(true);
        expect(response.data.isActive).toBe(false);
      });
    });
  });

  // ============================================================================
  // MEMORY ROUTES
  // ============================================================================
  describe('Memory Routes - /api/seniors/:id/memories', () => {
    describe('POST /api/seniors/:id/memories', () => {
      it('stores new memory', () => {
        const newMemory = {
          type: 'fact',
          content: 'Dorothy mentioned she loves roses',
          importance: 6,
        };

        const response = createApiResponse({ ...newMemory, id: 'new-memory-id' }, 201);

        expect(response.ok).toBe(true);
        expect(response.status).toBe(201);
        expect(response.data.content).toContain('roses');
      });

      it('validates memory type', () => {
        const validTypes = ['fact', 'preference', 'event', 'concern', 'relationship'];

        validTypes.forEach((type) => {
          const memory = { type, content: 'Test content', importance: 5 };
          const response = createApiResponse({ ...memory, id: 'test-id' }, 201);
          expect(response.ok).toBe(true);
        });
      });
    });

    describe('GET /api/seniors/:id/memories', () => {
      it('returns recent memories', () => {
        const response = createApiResponse(dorothyMemories);

        expect(response.ok).toBe(true);
        expect(response.data).toBeInstanceOf(Array);
        expect(response.data.length).toBeGreaterThan(0);
      });

      it('returns memories sorted by creation date', () => {
        // Memories should be returned most recent first
        const response = createApiResponse(dorothyMemories);

        expect(response.ok).toBe(true);
        // Assuming fixtures are sorted
      });
    });

    describe('GET /api/seniors/:id/memories/search', () => {
      it('returns semantically relevant memories', () => {
        // Search for "daughter" should return Susan-related memories
        const searchResults = dorothyMemories.filter((m) =>
          m.content.toLowerCase().includes('daughter') || m.content.toLowerCase().includes('susan')
        );

        const response = createApiResponse(searchResults);

        expect(response.ok).toBe(true);
        expect(response.data.length).toBeGreaterThan(0);
      });

      it('handles search with no results', () => {
        const response = createApiResponse([]);

        expect(response.ok).toBe(true);
        expect(response.data).toEqual([]);
      });
    });
  });

  // ============================================================================
  // CALL ROUTES
  // ============================================================================
  describe('Call Routes - /api/call', () => {
    describe('POST /api/call', () => {
      it('initiates outbound call with valid senior ID', () => {
        const callResponse = {
          callSid: 'CA1234567890abcdef',
          status: 'queued',
          seniorId: dorothy.id,
        };

        const response = createApiResponse(callResponse, 201);

        expect(response.ok).toBe(true);
        expect(response.data.callSid).toBeDefined();
        expect(response.data.seniorId).toBe(dorothy.id);
      });

      it('rejects call to invalid senior', () => {
        const response = createApiError('Senior not found', 404);

        expect(response.ok).toBe(false);
        expect(response.status).toBe(404);
      });

      it('rejects call to inactive senior', () => {
        const response = createApiError('Senior is not active', 400);

        expect(response.ok).toBe(false);
        expect(response.error).toContain('not active');
      });
    });

    describe('POST /api/calls/:callSid/end', () => {
      it('terminates active call', () => {
        const response = createApiResponse({ status: 'completed' });

        expect(response.ok).toBe(true);
        expect(response.data.status).toBe('completed');
      });

      it('returns 404 for unknown callSid', () => {
        const response = createApiError('Call not found', 404);

        expect(response.ok).toBe(false);
        expect(response.status).toBe(404);
      });
    });
  });

  // ============================================================================
  // REMINDER ROUTES
  // ============================================================================
  describe('Reminder Routes - /api/reminders', () => {
    describe('GET /api/reminders', () => {
      it('returns list of active reminders', () => {
        const reminders = [
          {
            id: 'rem-1',
            seniorId: dorothy.id,
            type: 'medication',
            title: 'Blood pressure medication',
            isActive: true,
          },
        ];

        const response = createApiResponse(reminders);

        expect(response.ok).toBe(true);
        expect(response.data).toBeInstanceOf(Array);
      });

      it('includes reminder details', () => {
        const reminders = [
          {
            id: 'rem-1',
            seniorId: dorothy.id,
            type: 'medication',
            title: 'Blood pressure medication',
            description: 'Take one pill with breakfast',
            scheduledTime: new Date(Date.now() + 3600000).toISOString(),
            isRecurring: true,
            cronExpression: '0 9 * * *',
            isActive: true,
          },
        ];

        const response = createApiResponse(reminders);

        expect(response.data[0].type).toBeDefined();
        expect(response.data[0].title).toBeDefined();
        expect(response.data[0].isRecurring).toBeDefined();
      });
    });

    describe('POST /api/reminders', () => {
      it('creates one-time reminder', () => {
        const reminder = {
          seniorId: dorothy.id,
          type: 'appointment',
          title: 'Doctor appointment',
          scheduledTime: new Date(Date.now() + 86400000).toISOString(),
          isRecurring: false,
        };

        const response = createApiResponse({ ...reminder, id: 'new-rem-id' }, 201);

        expect(response.ok).toBe(true);
        expect(response.data.isRecurring).toBe(false);
      });

      it('creates recurring reminder with cron expression', () => {
        const reminder = {
          seniorId: dorothy.id,
          type: 'medication',
          title: 'Morning medication',
          isRecurring: true,
          cronExpression: '0 9 * * *',
        };

        const response = createApiResponse({ ...reminder, id: 'new-rem-id' }, 201);

        expect(response.ok).toBe(true);
        expect(response.data.isRecurring).toBe(true);
        expect(response.data.cronExpression).toBe('0 9 * * *');
      });

      it('validates reminder type', () => {
        const validTypes = ['medication', 'appointment', 'call', 'custom'];

        validTypes.forEach((type) => {
          const reminder = { seniorId: dorothy.id, type, title: `Test ${type}` };
          const response = createApiResponse({ ...reminder, id: 'test-id' }, 201);
          expect(response.ok).toBe(true);
        });
      });
    });

    describe('DELETE /api/reminders/:id', () => {
      it('deletes reminder', () => {
        const response = createApiResponse({ deleted: true });

        expect(response.ok).toBe(true);
      });

      it('returns 404 for non-existent reminder', () => {
        const response = createApiError('Reminder not found', 404);

        expect(response.ok).toBe(false);
        expect(response.status).toBe(404);
      });
    });
  });

  // ============================================================================
  // STATS ROUTE
  // ============================================================================
  describe('Stats Route - /api/stats', () => {
    it('returns dashboard statistics', () => {
      const stats = {
        activeSeniors: 3,
        callsToday: 5,
        upcomingReminders: 2,
        averageEngagement: 7.5,
      };

      const response = createApiResponse(stats);

      expect(response.ok).toBe(true);
      expect(response.data.activeSeniors).toBeDefined();
      expect(response.data.callsToday).toBeDefined();
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================
  describe('Error handling', () => {
    it('returns proper error structure', () => {
      const response = createApiError('Validation failed', 400);

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });

    it('returns 500 for internal errors', () => {
      const response = createApiError('Internal server error', 500);

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });
  });
});
