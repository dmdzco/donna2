/**
 * Mock for Anthropic Claude API
 */

import { vi } from 'vitest';

// Mock streaming response chunks
export const mockStreamChunks = [
  { type: 'content_block_start', content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Dorothy! ' } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: "How are you feeling today?" } },
  { type: 'content_block_stop' },
  { type: 'message_stop' },
];

// Mock non-streaming response
export const mockResponse = {
  id: 'msg_mock123',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: "Hello Dorothy! How are you feeling today? I hope you're having a wonderful morning.",
    },
  ],
  model: 'claude-sonnet-4-20250514',
  stop_reason: 'end_turn',
  usage: {
    input_tokens: 150,
    output_tokens: 25,
  },
};

// Create mock Anthropic client
export const createMockAnthropicClient = () => {
  const mockClient = {
    messages: {
      create: vi.fn().mockResolvedValue(mockResponse),
      stream: vi.fn().mockImplementation(() => {
        // Return an async iterator that yields chunks
        let index = 0;
        return {
          async *[Symbol.asyncIterator]() {
            for (const chunk of mockStreamChunks) {
              yield chunk;
            }
          },
          on: vi.fn((event, callback) => {
            if (event === 'text') {
              mockStreamChunks
                .filter(c => c.type === 'content_block_delta')
                .forEach(c => callback(c.delta.text));
            }
            return mockClient.messages.stream();
          }),
        };
      }),
    },
  };

  return mockClient;
};

// Mock response generators for different scenarios
export const mockResponses = {
  greeting: {
    ...mockResponse,
    content: [{ type: 'text', text: "Hello Dorothy! How are you feeling today?" }],
  },

  healthConcern: {
    ...mockResponse,
    content: [
      {
        type: 'text',
        text: "I'm concerned to hear about your back pain, Dorothy. How long has it been bothering you? Have you told Susan or your doctor about the fall?",
      },
    ],
  },

  emotionalSupport: {
    ...mockResponse,
    content: [
      {
        type: 'text',
        text: "I'm so sorry you're feeling lonely, Harold. Grief can be so difficult, especially on days like your anniversary. Would you like to share a favorite memory of Margaret?",
      },
    ],
  },

  medicationReminder: {
    ...mockResponse,
    content: [
      {
        type: 'text',
        text: "Good morning Dorothy! I'm calling to check in. Have you had a chance to take your blood pressure medication today?",
      },
    ],
  },

  safetyAlert: {
    ...mockResponse,
    content: [
      {
        type: 'text',
        text: "That call sounds like a scam, Margaret. Medicare will never call and ask for your Social Security number. Did you give them any information? It's important we make sure you're protected.",
      },
    ],
  },
};

export default {
  createMockAnthropicClient,
  mockResponse,
  mockResponses,
  mockStreamChunks,
};
