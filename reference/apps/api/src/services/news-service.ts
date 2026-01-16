import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

interface NewsItem {
  title: string;
  summary: string;
  source: string;
  relevance: string;
  url?: string;
}

interface Senior {
  name: string;
  interests: string[];
  location_city?: string;
  location_state?: string;
  date_of_birth?: string;
}

/**
 * Service for fetching and personalizing news updates for seniors
 */
export class NewsService {
  /**
   * Fetch personalized news for a senior based on their interests and location
   */
  async getPersonalizedNews(
    senior: Senior,
    maxItems: number = 3
  ): Promise<NewsItem[]> {
    if (!senior.interests || senior.interests.length === 0) {
      return [];
    }

    try {
      // Build search queries based on interests and location
      const searchQueries = this.buildSearchQueries(senior);

      // Use Claude with web search to find relevant news
      const newsPrompt = this.buildNewsPrompt(senior, searchQueries);

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `You are a news curator for elderly individuals. Find recent, positive, and relevant news stories that would interest them based on their profile. Focus on uplifting stories, local news, and topics related to their interests. Avoid overly technical jargon or distressing content.

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
]`,
        messages: [
          {
            role: 'user',
            content: newsPrompt,
          },
        ],
      });

      const responseText = response.content[0].type === 'text'
        ? response.content[0].text
        : '[]';

      // Extract JSON from response (handle potential markdown code blocks)
      let jsonText = responseText.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '').trim();
      }

      const newsItems = JSON.parse(jsonText) as NewsItem[];

      // Limit to maxItems
      return newsItems.slice(0, maxItems);
    } catch (error) {
      console.error('Error fetching personalized news:', error);
      return [];
    }
  }

  /**
   * Build search queries based on senior's profile
   */
  private buildSearchQueries(senior: Senior): string[] {
    const queries: string[] = [];
    const today = new Date().toISOString().split('T')[0];

    // Interest-based queries
    senior.interests.forEach(interest => {
      queries.push(`${interest} news ${today}`);
    });

    // Location-based queries
    if (senior.location_city && senior.location_state) {
      queries.push(`${senior.location_city} ${senior.location_state} local news ${today}`);
      queries.push(`${senior.location_city} community events ${today}`);
    }

    return queries;
  }

  /**
   * Build the news search prompt for Claude
   */
  private buildNewsPrompt(senior: Senior, searchQueries: string[]): string {
    const age = senior.date_of_birth
      ? Math.floor((Date.now() - new Date(senior.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : undefined;

    return `Find recent news stories for ${senior.name}${age ? `, age ${age}` : ''}.

INTERESTS: ${senior.interests.join(', ')}
${senior.location_city ? `LOCATION: ${senior.location_city}, ${senior.location_state}` : ''}

Search for recent news (from the past week) related to:
${searchQueries.map(q => `- ${q}`).join('\n')}

Focus on:
- Positive, uplifting stories
- Local community news
- Stories related to their interests
- Easy-to-understand content appropriate for seniors
- Avoid: Politics, tragedies, complex technical topics

Return 3-5 relevant news items in JSON format.`;
  }

  /**
   * Format news items for conversation (as a brief summary)
   */
  formatForConversation(newsItems: NewsItem[]): string {
    if (newsItems.length === 0) {
      return '';
    }

    const formatted = newsItems.map((item, index) =>
      `${index + 1}. ${item.title} - ${item.summary}`
    ).join('\n\n');

    return `Here are some interesting news updates I found for you:\n\n${formatted}`;
  }

  /**
   * Get a single random news item for casual mention
   */
  getRandomNewsItem(newsItems: NewsItem[]): NewsItem | null {
    if (newsItems.length === 0) {
      return null;
    }
    return newsItems[Math.floor(Math.random() * newsItems.length)];
  }
}

export const newsService = new NewsService();
