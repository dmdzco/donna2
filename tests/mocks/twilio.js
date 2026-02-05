/**
 * Mock for Twilio API
 */

import { vi } from 'vitest';

// Mock call response
export const mockCallResponse = {
  sid: 'CA1234567890abcdef',
  status: 'queued',
  to: '+15559876543',
  from: '+15551234567',
  direction: 'outbound-api',
  dateCreated: new Date().toISOString(),
  dateUpdated: new Date().toISOString(),
};

// Mock call status updates
export const mockCallStatuses = {
  initiated: { ...mockCallResponse, status: 'initiated' },
  ringing: { ...mockCallResponse, status: 'ringing' },
  inProgress: { ...mockCallResponse, status: 'in-progress' },
  completed: { ...mockCallResponse, status: 'completed', duration: 180 },
  busy: { ...mockCallResponse, status: 'busy' },
  noAnswer: { ...mockCallResponse, status: 'no-answer' },
  failed: { ...mockCallResponse, status: 'failed' },
};

// Create mock Twilio client
export const createMockTwilioClient = () => {
  const mockClient = {
    calls: {
      create: vi.fn().mockResolvedValue(mockCallResponse),
      get: vi.fn().mockImplementation((sid) => ({
        fetch: vi.fn().mockResolvedValue({ ...mockCallResponse, sid }),
        update: vi.fn().mockResolvedValue({ ...mockCallResponse, sid, status: 'completed' }),
      })),
      list: vi.fn().mockResolvedValue([mockCallResponse]),
    },
    messages: {
      create: vi.fn().mockResolvedValue({
        sid: 'SM1234567890abcdef',
        status: 'sent',
      }),
    },
  };

  return mockClient;
};

// Mock webhook payloads
export const mockWebhookPayloads = {
  callAnswered: {
    CallSid: 'CA1234567890abcdef',
    AccountSid: 'AC1234567890abcdef',
    From: '+15551234567',
    To: '+15559876543',
    CallStatus: 'in-progress',
    Direction: 'outbound-api',
    Timestamp: new Date().toISOString(),
  },

  callCompleted: {
    CallSid: 'CA1234567890abcdef',
    AccountSid: 'AC1234567890abcdef',
    From: '+15551234567',
    To: '+15559876543',
    CallStatus: 'completed',
    CallDuration: '180',
    Direction: 'outbound-api',
    Timestamp: new Date().toISOString(),
  },

  callFailed: {
    CallSid: 'CA1234567890abcdef',
    AccountSid: 'AC1234567890abcdef',
    From: '+15551234567',
    To: '+15559876543',
    CallStatus: 'failed',
    ErrorCode: '21211',
    ErrorMessage: 'Invalid phone number',
    Direction: 'outbound-api',
    Timestamp: new Date().toISOString(),
  },
};

// Mock Media Stream events
export const mockMediaStreamEvents = {
  connected: {
    event: 'connected',
    protocol: 'Call',
    version: '0.2.0',
  },

  start: {
    event: 'start',
    sequenceNumber: '1',
    start: {
      streamSid: 'MZ1234567890abcdef',
      accountSid: 'AC1234567890abcdef',
      callSid: 'CA1234567890abcdef',
      tracks: ['inbound'],
      customParameters: {
        seniorId: 'senior-dorothy',
      },
      mediaFormat: {
        encoding: 'audio/x-mulaw',
        sampleRate: 8000,
        channels: 1,
      },
    },
  },

  media: {
    event: 'media',
    sequenceNumber: '2',
    media: {
      track: 'inbound',
      chunk: '1',
      timestamp: '5',
      payload: 'base64encodedaudio==',
    },
  },

  stop: {
    event: 'stop',
    sequenceNumber: '100',
    stop: {
      accountSid: 'AC1234567890abcdef',
      callSid: 'CA1234567890abcdef',
    },
  },
};

// Generate valid Twilio signature for webhook testing
export const generateTwilioSignature = (authToken, url, params) => {
  const crypto = await import('crypto');
  const data = url + Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], '');
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
};

export default {
  createMockTwilioClient,
  mockCallResponse,
  mockCallStatuses,
  mockWebhookPayloads,
  mockMediaStreamEvents,
  generateTwilioSignature,
};
