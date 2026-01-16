import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Anthropic SDK before imports
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  return {
    default: class {
      messages = {
        create: mockCreate,
      };
    },
    __mockCreate: mockCreate, // Export for test access
  };
});

import { NewsService } from './news-service.js';
const Anthropic = await import('@anthropic-ai/sdk');
const mockMessagesCreate = (Anthropic as any).__mockCreate;

describe('NewsService', () => {
  let newsService: NewsService;

  beforeEach(() => {
    newsService = new NewsService();
    vi.clearAllMocks();
  });

  describe('getPersonalizedNews', () => {
    it('should return empty array if senior has no interests', async () => {
      const senior = {
        name: 'John Doe',
        interests: [],
      };

      const news = await newsService.getPersonalizedNews(senior);
      expect(news).toEqual([]);
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it('should fetch personalized news based on interests', async () => {
      const senior = {
        name: 'Mary Smith',
        interests: ['gardening', 'cooking'],
        location_city: 'Portland',
        location_state: 'OR',
        date_of_birth: '1950-05-15',
      };

      const mockNewsResponse = [
        {
          title: 'Local Garden Club Hosts Spring Festival',
          summary: 'The community garden club is hosting its annual spring festival next weekend.',
          source: 'Portland Daily',
          relevance: 'Relates to your interest in gardening',
          url: 'https://example.com/garden-festival',
        },
        {
          title: 'New Farmers Market Opens Downtown',
          summary: 'A new farmers market featuring local produce and artisan foods opened this week.',
          source: 'Portland Tribune',
          relevance: 'Relates to your interest in cooking and local events',
          url: 'https://example.com/farmers-market',
        },
      ];

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockNewsResponse),
          },
        ],
      });

      const news = await newsService.getPersonalizedNews(senior, 3);

      expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
      expect(news).toHaveLength(2);
      expect(news[0].title).toBe('Local Garden Club Hosts Spring Festival');
      expect(news[1].title).toBe('New Farmers Market Opens Downtown');
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const senior = {
        name: 'John Doe',
        interests: ['fishing'],
      };

      const mockNewsResponse = [
        {
          title: 'Best Fishing Spots This Season',
          summary: 'Local anglers share their favorite locations.',
          source: 'Outdoor Magazine',
          relevance: 'Relates to your interest in fishing',
        },
      ];

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '```json\n' + JSON.stringify(mockNewsResponse) + '\n```',
          },
        ],
      });

      const news = await newsService.getPersonalizedNews(senior);

      expect(news).toHaveLength(1);
      expect(news[0].title).toBe('Best Fishing Spots This Season');
    });

    it('should limit results to maxItems', async () => {
      const senior = {
        name: 'Jane Doe',
        interests: ['reading', 'music'],
      };

      const mockNewsResponse = [
        { title: 'News 1', summary: 'Summary 1', source: 'Source 1', relevance: 'Relevant 1' },
        { title: 'News 2', summary: 'Summary 2', source: 'Source 2', relevance: 'Relevant 2' },
        { title: 'News 3', summary: 'Summary 3', source: 'Source 3', relevance: 'Relevant 3' },
        { title: 'News 4', summary: 'Summary 4', source: 'Source 4', relevance: 'Relevant 4' },
      ];

      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(mockNewsResponse) }],
      });

      const news = await newsService.getPersonalizedNews(senior, 2);

      expect(news).toHaveLength(2);
      expect(news[0].title).toBe('News 1');
      expect(news[1].title).toBe('News 2');
    });

    it('should return empty array on error', async () => {
      const senior = {
        name: 'John Doe',
        interests: ['sports'],
      };

      mockMessagesCreate.mockRejectedValue(new Error('API Error'));

      const news = await newsService.getPersonalizedNews(senior);

      expect(news).toEqual([]);
    });
  });

  describe('formatForConversation', () => {
    it('should format news items for conversation', () => {
      const newsItems = [
        {
          title: 'Garden Festival',
          summary: 'A community event this weekend.',
          source: 'Local News',
          relevance: 'Relates to gardening',
        },
        {
          title: 'Cooking Class',
          summary: 'Free cooking classes at the library.',
          source: 'Community Bulletin',
          relevance: 'Relates to cooking',
        },
      ];

      const formatted = newsService.formatForConversation(newsItems);

      expect(formatted).toContain('1. Garden Festival');
      expect(formatted).toContain('A community event this weekend.');
      expect(formatted).toContain('2. Cooking Class');
      expect(formatted).toContain('Free cooking classes at the library.');
    });

    it('should return empty string if no news items', () => {
      const formatted = newsService.formatForConversation([]);
      expect(formatted).toBe('');
    });
  });

  describe('getRandomNewsItem', () => {
    it('should return a random news item', () => {
      const newsItems = [
        {
          title: 'News 1',
          summary: 'Summary 1',
          source: 'Source 1',
          relevance: 'Relevant 1',
        },
        {
          title: 'News 2',
          summary: 'Summary 2',
          source: 'Source 2',
          relevance: 'Relevant 2',
        },
      ];

      const randomItem = newsService.getRandomNewsItem(newsItems);

      expect(randomItem).not.toBeNull();
      expect(newsItems).toContainEqual(randomItem);
    });

    it('should return null if no news items', () => {
      const randomItem = newsService.getRandomNewsItem([]);
      expect(randomItem).toBeNull();
    });
  });
});
