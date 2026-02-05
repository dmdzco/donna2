/**
 * Mock for OpenAI API
 *
 * Used for embeddings and news/web search
 */

import { vi } from 'vitest';

// Create a deterministic mock embedding based on text
const createMockEmbedding = (text) => {
  // Generate a deterministic embedding based on text hash
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return new Array(1536).fill(0).map((_, i) => Math.sin(hash + i * 0.1) * 0.5);
};

// Mock embedding response
export const mockEmbeddingResponse = {
  object: 'list',
  data: [
    {
      object: 'embedding',
      index: 0,
      embedding: createMockEmbedding('test text'),
    },
  ],
  model: 'text-embedding-3-small',
  usage: {
    prompt_tokens: 10,
    total_tokens: 10,
  },
};

// Mock news/web search response
export const mockNewsResponse = {
  id: 'chatcmpl-mock123',
  object: 'chat.completion',
  created: Date.now(),
  model: 'gpt-4o-mini',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: JSON.stringify([
          {
            title: 'Local Garden Show This Weekend',
            summary: 'The annual garden show returns with beautiful displays and expert tips for spring planting.',
            source: 'Local News',
          },
          {
            title: 'Community Center Hosts Bingo Night',
            summary: 'Weekly bingo returns with prizes and refreshments. All seniors welcome.',
            source: 'Community Events',
          },
        ]),
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 50,
    completion_tokens: 100,
    total_tokens: 150,
  },
};

// Create mock OpenAI client
export const createMockOpenAIClient = () => {
  const mockClient = {
    embeddings: {
      create: vi.fn().mockImplementation(async ({ input }) => {
        const texts = Array.isArray(input) ? input : [input];
        return {
          ...mockEmbeddingResponse,
          data: texts.map((text, index) => ({
            object: 'embedding',
            index,
            embedding: createMockEmbedding(text),
          })),
        };
      }),
    },
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue(mockNewsResponse),
      },
    },
  };

  return mockClient;
};

// Specific embedding responses for testing similarity
export const mockSimilarEmbeddings = {
  // These two should be very similar (same topic)
  original: createMockEmbedding("Dorothy's daughter Susan visits every Sunday"),
  similar: createMockEmbedding("Susan, Dorothy's daughter, comes over on Sundays"),

  // This should be different
  different: createMockEmbedding("Harold enjoys watching baseball games"),
};

// News responses for different interests
export const mockNewsResponses = {
  gardening: {
    ...mockNewsResponse,
    choices: [
      {
        ...mockNewsResponse.choices[0],
        message: {
          role: 'assistant',
          content: JSON.stringify([
            {
              title: 'Best Plants for Spring Gardens',
              summary: 'Expert tips on what to plant this spring for a beautiful garden.',
              source: 'Garden Weekly',
            },
          ]),
        },
      },
    ],
  },

  baseball: {
    ...mockNewsResponse,
    choices: [
      {
        ...mockNewsResponse.choices[0],
        message: {
          role: 'assistant',
          content: JSON.stringify([
            {
              title: 'Cubs Win Opening Day',
              summary: 'The Chicago Cubs started the season strong with a 5-2 victory.',
              source: 'Sports News',
            },
          ]),
        },
      },
    ],
  },

  empty: {
    ...mockNewsResponse,
    choices: [
      {
        ...mockNewsResponse.choices[0],
        message: {
          role: 'assistant',
          content: JSON.stringify([]),
        },
      },
    ],
  },
};

export default {
  createMockOpenAIClient,
  createMockEmbedding,
  mockEmbeddingResponse,
  mockNewsResponse,
  mockNewsResponses,
  mockSimilarEmbeddings,
};
