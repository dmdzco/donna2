import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  getRecentSummaries: vi.fn(),
  getCritical: vi.fn(),
  getImportant: vi.fn(),
  getRecent: vi.fn(),
  getGreeting: vi.fn(),
  getNewsForSenior: vi.fn(),
  dbUpdate: vi.fn(),
}));

vi.mock('../../services/seniors.js', () => ({
  seniorService: {
    getById: mocks.getById,
    list: vi.fn(),
  },
}));

vi.mock('../../services/conversations.js', () => ({
  conversationService: {
    getRecentSummaries: mocks.getRecentSummaries,
  },
}));

vi.mock('../../services/memory.js', () => ({
  memoryService: {
    getCritical: mocks.getCritical,
    getImportant: mocks.getImportant,
    getRecent: mocks.getRecent,
    groupByType: vi.fn(() => ({})),
    formatGroupedMemories: vi.fn(() => ''),
  },
}));

vi.mock('../../services/greetings.js', () => ({
  greetingService: {
    getGreeting: mocks.getGreeting,
  },
}));

vi.mock('../../services/news.js', () => ({
  newsService: {
    getNewsForSenior: mocks.getNewsForSenior,
  },
}));

vi.mock('../../db/client.js', () => ({
  db: {
    update: mocks.dbUpdate,
  },
}));

const { contextCacheService } = await import('../../services/context-cache.js');

describe('contextCacheService news prefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contextCacheService.clearAll();
    mocks.getById.mockResolvedValue({
      id: 'senior-1',
      name: 'Margaret Smith',
      timezone: 'America/New_York',
      interests: ['gardening'],
    });
    mocks.getRecentSummaries.mockResolvedValue('Recent summary');
    mocks.getCritical.mockResolvedValue([]);
    mocks.getImportant.mockResolvedValue([]);
    mocks.getRecent.mockResolvedValue([]);
    mocks.getGreeting.mockReturnValue({
      greeting: 'Hi Margaret',
      period: 'morning',
      templateIndex: 1,
      selectedInterest: 'gardening',
    });
  });

  it('persists fresh news to the senior row', async () => {
    const where = vi.fn(() => Promise.resolve());
    const set = vi.fn(() => ({ where }));
    mocks.dbUpdate.mockReturnValue({ set });
    mocks.getNewsForSenior.mockResolvedValue('Here are fresh gardening stories.');

    const result = await contextCacheService.prefetchAndCache('senior-1');

    expect(mocks.getNewsForSenior).toHaveBeenCalledWith(['gardening'], 8);
    expect(mocks.dbUpdate).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      cachedNews: 'Here are fresh gardening stories.',
      cachedNewsUpdatedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    }));
    expect(where).toHaveBeenCalledOnce();
    expect(result.newsContext).toBe('Here are fresh gardening stories.');
  });

  it('does not overwrite cached news when news fetch returns empty', async () => {
    mocks.getNewsForSenior.mockResolvedValue(null);

    const result = await contextCacheService.prefetchAndCache('senior-1');

    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(result.newsContext).toBeNull();
  });
});
