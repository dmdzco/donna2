/**
 * Mock for ElevenLabs TTS API
 */

import { vi } from 'vitest';

// Mock audio chunk (base64 encoded audio)
const mockAudioChunk = Buffer.from('mock-audio-data').toString('base64');

// Mock REST TTS response
export const mockTTSResponse = {
  audio: Buffer.from('mock-audio-data'),
  alignment: {
    characters: ['H', 'e', 'l', 'l', 'o'],
    character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
    character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5],
  },
};

// Mock WebSocket message types
export const mockWSMessages = {
  // Initial connection acknowledgment
  connected: {
    isFinal: false,
    normalizedAlignment: null,
    audio: null,
  },

  // Audio chunk response
  audioChunk: {
    isFinal: false,
    normalizedAlignment: {
      chars: ['H', 'e', 'l', 'l', 'o'],
      charStartTimesMs: [0, 100, 200, 300, 400],
      charDurationsMs: [100, 100, 100, 100, 100],
    },
    audio: mockAudioChunk,
  },

  // Final message
  final: {
    isFinal: true,
    normalizedAlignment: null,
    audio: null,
  },
};

// Create mock ElevenLabs WebSocket
export const createMockElevenLabsWebSocket = () => {
  const listeners = new Map();
  let isOpen = false;
  let messageQueue = [];

  const mockWS = {
    readyState: 0, // CONNECTING

    send: vi.fn().mockImplementation((data) => {
      if (!isOpen) {
        throw new Error('WebSocket is not open');
      }

      // Parse the text input and queue audio response
      const parsed = JSON.parse(data);
      if (parsed.text) {
        // Simulate response after a short delay
        setTimeout(() => {
          const messageHandler = listeners.get('message');
          if (messageHandler) {
            // Send audio chunks
            messageHandler({ data: JSON.stringify(mockWSMessages.audioChunk) });
          }
        }, 10);
      }
    }),

    close: vi.fn().mockImplementation(() => {
      isOpen = false;
      mockWS.readyState = 3; // CLOSED
      const closeHandler = listeners.get('close');
      if (closeHandler) closeHandler({ code: 1000, reason: 'Normal closure' });
    }),

    on: vi.fn().mockImplementation((event, handler) => {
      listeners.set(event, handler);
      return mockWS;
    }),

    addEventListener: vi.fn().mockImplementation((event, handler) => {
      listeners.set(event, handler);
    }),

    removeEventListener: vi.fn().mockImplementation((event) => {
      listeners.delete(event);
    }),

    // Simulate connection open
    simulateOpen: () => {
      isOpen = true;
      mockWS.readyState = 1; // OPEN
      const openHandler = listeners.get('open');
      if (openHandler) openHandler();
    },

    // Simulate receiving a message
    simulateMessage: (message) => {
      const messageHandler = listeners.get('message');
      if (messageHandler) {
        messageHandler({ data: JSON.stringify(message) });
      }
    },

    // Simulate error
    simulateError: (error) => {
      const errorHandler = listeners.get('error');
      if (errorHandler) {
        errorHandler(new Error(error));
      }
    },
  };

  return mockWS;
};

// Create mock ElevenLabs REST client
export const createMockElevenLabsClient = () => {
  return {
    textToSpeech: vi.fn().mockResolvedValue(mockTTSResponse),
    getVoices: vi.fn().mockResolvedValue({
      voices: [
        { voice_id: 'rachel', name: 'Rachel', category: 'premade' },
        { voice_id: 'river', name: 'River', category: 'premade' },
        { voice_id: 'bella', name: 'Bella', category: 'premade' },
      ],
    }),
  };
};

// Voice IDs used in the app
export const voiceIds = {
  rachel: '21m00Tcm4TlvDq8ikWAM', // Warm, empathetic
  river: 'SAz9YHcvj6GT2YYXdXww', // Default
  bella: 'EXAVITQu4vr4xnSDxMaL', // Friendly
};

export default {
  createMockElevenLabsWebSocket,
  createMockElevenLabsClient,
  mockTTSResponse,
  mockWSMessages,
  voiceIds,
};
