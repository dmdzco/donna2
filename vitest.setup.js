/**
 * Vitest Global Setup
 *
 * Sets up test environment, mocks, and global utilities
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/donna_test';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.GOOGLE_API_KEY = 'test-google-key';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.TWILIO_ACCOUNT_SID = 'test-twilio-sid';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.TWILIO_PHONE_NUMBER = '+15551234567';
process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
process.env.DEEPGRAM_API_KEY = 'test-deepgram-key';

// Global test utilities
beforeAll(() => {
  // Setup that runs once before all tests
});

afterAll(() => {
  // Cleanup that runs once after all tests
});

afterEach(() => {
  // Cleanup that runs after each test
  vi.clearAllMocks();
});

// Global test helpers
globalThis.testHelpers = {
  /**
   * Create a mock senior for testing
   */
  createMockSenior: (overrides = {}) => ({
    id: 'test-senior-id',
    name: 'Dorothy',
    phone: '+15559876543',
    timezone: 'America/New_York',
    interests: ['gardening', 'baking', 'church'],
    family: {
      daughter: 'Susan',
      grandson: 'Tommy',
      pet: 'cat named Whiskers',
    },
    medicalNotes: 'Takes blood pressure medication daily',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  /**
   * Create a mock conversation transcript
   */
  createMockTranscript: () => [
    { role: 'assistant', content: 'Hello Dorothy! How are you feeling today?' },
    { role: 'user', content: "Oh hello dear! I'm doing alright, just a bit tired." },
    { role: 'assistant', content: "I'm sorry to hear you're tired. Did you sleep well last night?" },
    { role: 'user', content: "Not really, I was up a few times. My back was bothering me." },
  ],

  /**
   * Create a mock memory
   */
  createMockMemory: (overrides = {}) => ({
    id: 'test-memory-id',
    seniorId: 'test-senior-id',
    type: 'fact',
    content: "Dorothy's daughter Susan visits every Sunday",
    embedding: new Array(1536).fill(0.1),
    importance: 7,
    source: 'conversation',
    metadata: {},
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 1,
    ...overrides,
  }),

  /**
   * Create a mock reminder
   */
  createMockReminder: (overrides = {}) => ({
    id: 'test-reminder-id',
    seniorId: 'test-senior-id',
    type: 'medication',
    title: 'Blood pressure medication',
    description: 'Take one pill with breakfast',
    scheduledTime: new Date(Date.now() + 3600000), // 1 hour from now
    isRecurring: true,
    cronExpression: '0 9 * * *', // Daily at 9 AM
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  }),
};
