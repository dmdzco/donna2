import {
  Skill,
  SkillParams,
  SkillResult,
  IAnthropicAdapter,
  NewsItem,
} from '@donna/shared/interfaces';

/**
 * News Search Skill
 *
 * Fetches personalized news for seniors based on their interests and location.
 * This skill is completely independent and can be:
 * - Enabled/disabled without code changes
 * - Replaced with a different news source
 * - Tested in isolation
 *
 * Originally from: apps/api/src/services/news-service.ts
 * Now: A pluggable skill!
 */
export class NewsSearchSkill implements Skill {
  name = 'news-search';
  description = 'Fetch personalized news updates for seniors based on their interests and location';
  version = '1.0.0';
  parameters = [
    {
      name: 'maxItems',
      type: 'number' as const,
      required: false,
      description: 'Maximum number of news items to return (default: 3)',
    },
  ];

  constructor(private llmAdapter: IAnthropicAdapter) {}

  async execute(params: SkillParams): Promise<SkillResult> {
    const { senior } = params;
    const maxItems = params.maxItems || 3;

    if (!senior.interests || senior.interests.length === 0) {
      return {
        success: true,
        data: [],
        metadata: { reason: 'No interests specified for senior' },
      };
    }

    try {
      const newsItems = await this.fetchPersonalizedNews(senior, maxItems);

      return {
        success: true,
        data: newsItems,
        metadata: {
          count: newsItems.length,
          interests: senior.interests,
        },
      };
    } catch (error: any) {
      console.error('Error fetching personalized news:', error);
      return {
        success: false,
        data: [],
        error: error.message || 'Failed to fetch news',
      };
    }
  }

  private async fetchPersonalizedNews(
    senior: any,
    maxItems: number
  ): Promise<NewsItem[]> {
    const searchQueries = this.buildSearchQueries(senior);
    const newsPrompt = this.buildNewsPrompt(senior, searchQueries);

    const systemPrompt = `You are a news curator for elderly individuals. Find recent, positive, and relevant news stories that would interest them based on their profile. Focus on uplifting stories, local news, and topics related to their interests. Avoid overly technical jargon or distressing content.

Return your response as a JSON array of news items, each with:
- title: Brief, clear headline
- summary: 2-3 sentence summary in simple language
- source: News source name
- relevance: Why this is relevant to them (one sentence)
- url: Source URL if available

Example format:
[
  {
    "title": "Local Garden Club Hosts Spring Festival",
    "summary": "The community garden club is hosting its annual spring festival next weekend. The event will feature plant sales, gardening workshops, and refreshments.",
    "source": "Local News",
    "relevance": "Relates to your interest in gardening and community events",
    "url": "https://example.com/article"
  }
]`;

    const response = await this.llmAdapter.chat(
      [{ role: 'user', content: newsPrompt }],
      systemPrompt,
      { maxTokens: 2000, temperature: 0.7 }
    );

    // Extract JSON from response
    let jsonText = response.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').trim();
    }

    const newsItems = JSON.parse(jsonText) as NewsItem[];
    return newsItems.slice(0, maxItems);
  }

  private buildSearchQueries(senior: any): string[] {
    const queries: string[] = [];
    const today = new Date().toISOString().split('T')[0];

    // Interest-based queries
    senior.interests.forEach((interest: string) => {
      queries.push(`${interest} news ${today}`);
    });

    // Location-based queries
    if (senior.locationCity && senior.locationState) {
      queries.push(`${senior.locationCity} ${senior.locationState} local news ${today}`);
      queries.push(`${senior.locationCity} community events ${today}`);
    }

    return queries;
  }

  private buildNewsPrompt(senior: any, searchQueries: string[]): string {
    const age = senior.dateOfBirth
      ? Math.floor(
          (Date.now() - new Date(senior.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        )
      : undefined;

    return `Find recent news stories for ${senior.name}${age ? `, age ${age}` : ''}.

INTERESTS: ${senior.interests.join(', ')}
${senior.locationCity ? `LOCATION: ${senior.locationCity}, ${senior.locationState}` : ''}

Search for recent news (from the past week) related to:
${searchQueries.map((q: string) => `- ${q}`).join('\n')}

Focus on:
- Positive, uplifting stories
- Local community news
- Stories related to their interests
- Easy-to-understand content appropriate for seniors
- Avoid: Politics, tragedies, complex technical topics

Return 3-5 relevant news items in JSON format.`;
  }
}
