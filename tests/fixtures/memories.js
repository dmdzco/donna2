/**
 * Test fixtures for memory data
 */

// Create a mock embedding (1536 dimensions for OpenAI text-embedding-3-small)
const createMockEmbedding = (seed = 0) => {
  return new Array(1536).fill(0).map((_, i) => Math.sin(seed + i * 0.1) * 0.5);
};

// Helper to create dates relative to now
const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

// Export createMockEmbedding for use in tests
export { createMockEmbedding };

export const dorothyMemories = [
  {
    id: 'memory-dorothy-1',
    seniorId: 'senior-dorothy',
    type: 'fact',
    content: "Dorothy's daughter Susan visits every Sunday after church",
    embedding: createMockEmbedding(1),
    importance: 8,
    source: 'conversation',
    metadata: { confidence: 0.9 },
    createdAt: daysAgo(60),
    lastAccessedAt: daysAgo(2), // Recently accessed
    accessCount: 5,
  },
  {
    id: 'memory-dorothy-2',
    seniorId: 'senior-dorothy',
    type: 'preference',
    content: 'Dorothy loves baking chocolate chip cookies with her grandson Tommy',
    embedding: createMockEmbedding(2),
    importance: 7,
    source: 'conversation',
    metadata: { topic: 'baking' },
    createdAt: daysAgo(45),
    lastAccessedAt: daysAgo(10),
    accessCount: 3,
  },
  {
    id: 'memory-dorothy-3',
    seniorId: 'senior-dorothy',
    type: 'concern',
    content: 'Dorothy mentioned having back pain that started after a fall',
    embedding: createMockEmbedding(3),
    importance: 9,
    source: 'conversation',
    metadata: { severity: 'medium', category: 'health' },
    createdAt: daysAgo(7),
    lastAccessedAt: daysAgo(1), // Recently accessed
    accessCount: 1,
  },
  {
    id: 'memory-dorothy-4',
    seniorId: 'senior-dorothy',
    type: 'event',
    content: "Dorothy's cat Whiskers had kittens last month",
    embedding: createMockEmbedding(4),
    importance: 5,
    source: 'conversation',
    metadata: { topic: 'pets' },
    createdAt: daysAgo(30),
    lastAccessedAt: daysAgo(15),
    accessCount: 2,
  },
  {
    id: 'memory-dorothy-5',
    seniorId: 'senior-dorothy',
    type: 'relationship',
    content: 'Dorothy has been friends with Martha from church for over 40 years',
    embedding: createMockEmbedding(5),
    importance: 6,
    source: 'conversation',
    metadata: { relationship_type: 'friend' },
    createdAt: daysAgo(90),
    lastAccessedAt: daysAgo(30),
    accessCount: 2,
  },
];

export const haroldMemories = [
  {
    id: 'memory-harold-1',
    seniorId: 'senior-harold',
    type: 'fact',
    content: "Harold's late wife Margaret passed away two years ago from cancer",
    embedding: createMockEmbedding(10),
    importance: 10,
    source: 'conversation',
    metadata: { sensitive: true },
    createdAt: daysAgo(120),
    lastAccessedAt: daysAgo(3),
    accessCount: 8,
  },
  {
    id: 'memory-harold-2',
    seniorId: 'senior-harold',
    type: 'preference',
    content: 'Harold is a big Cubs fan and listens to every game on the radio',
    embedding: createMockEmbedding(11),
    importance: 6,
    source: 'conversation',
    metadata: { topic: 'baseball' },
    createdAt: daysAgo(100),
    lastAccessedAt: daysAgo(14),
    accessCount: 4,
  },
  {
    id: 'memory-harold-3',
    seniorId: 'senior-harold',
    type: 'concern',
    content: 'Harold has been experiencing episodes of confusion and disorientation',
    embedding: createMockEmbedding(12),
    importance: 9,
    source: 'conversation',
    metadata: { severity: 'high', category: 'cognitive' },
    createdAt: daysAgo(20),
    lastAccessedAt: daysAgo(1),
    accessCount: 2,
  },
];

// Memory that should be considered "stale" (old, not accessed recently)
export const staleMemory = {
  id: 'memory-stale',
  seniorId: 'senior-dorothy',
  type: 'fact',
  content: 'Dorothy mentioned wanting to visit Florida last winter',
  embedding: createMockEmbedding(100),
  importance: 4,
  source: 'conversation',
  metadata: {},
  createdAt: daysAgo(180), // 6 months old
  lastAccessedAt: daysAgo(120), // Not accessed in 4 months (well over 90 day threshold)
  accessCount: 1,
};

// Similar memories for deduplication testing
export const similarMemories = [
  {
    id: 'memory-similar-1',
    seniorId: 'senior-dorothy',
    type: 'fact',
    content: "Dorothy's daughter Susan visits on Sundays",
    embedding: createMockEmbedding(1), // Same embedding as dorothyMemories[0]
    importance: 7,
    source: 'conversation',
    metadata: {},
    createdAt: daysAgo(5),
    lastAccessedAt: daysAgo(5),
    accessCount: 1,
  },
  {
    id: 'memory-similar-2',
    seniorId: 'senior-dorothy',
    type: 'fact',
    content: 'Susan, Dorothy\'s daughter, comes over every Sunday after church services',
    embedding: createMockEmbedding(1.01), // Very similar embedding
    importance: 8,
    source: 'conversation',
    metadata: {},
    createdAt: daysAgo(4),
    lastAccessedAt: daysAgo(4),
    accessCount: 1,
  },
];

export default {
  dorothyMemories,
  haroldMemories,
  staleMemory,
  similarMemories,
  createMockEmbedding,
};
