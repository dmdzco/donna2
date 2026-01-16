/**
 * Memory & Context Module
 *
 * Manages long-term memory storage and context building for seniors.
 * Provides intelligent context for AI conversations based on:
 * - Important memories (facts, preferences, events, concerns)
 * - Recent conversation summaries
 * - Topic tracking and trends
 */

import type {
  IMemoryContext,
  IConversationManager,
  ISeniorProfiles,
  IEmbeddingAdapter,
  Memory,
  MemoryData,
  MemoryFilters,
  ConversationContext,
  ContextScope,
} from '@donna/shared/interfaces';
import type { IMemoryRepository } from './repository';

export class MemoryContextService implements IMemoryContext {
  constructor(
    private repository: IMemoryRepository,
    private conversationManager: IConversationManager,
    private seniorProfiles: ISeniorProfiles,
    private embeddingAdapter: IEmbeddingAdapter
  ) {}

  /**
   * Store a new memory for a senior
   */
  async storeMemory(seniorId: string, memory: MemoryData): Promise<Memory> {
    // Validate senior exists
    const senior = await this.seniorProfiles.getById(seniorId);
    if (!senior) {
      throw new Error(`Senior with id ${seniorId} not found`);
    }

    // Validate memory data
    if (!memory.content || memory.content.trim() === '') {
      throw new Error('Memory content is required');
    }

    const validTypes = ['fact', 'preference', 'event', 'concern'];
    if (!validTypes.includes(memory.type)) {
      throw new Error(`Invalid memory type: ${memory.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    // Generate embedding for semantic search
    const embedding = await this.embeddingAdapter.generateEmbedding(memory.content);

    return this.repository.create(seniorId, { ...memory, embedding });
  }

  /**
   * Get memories for a senior with optional filtering
   */
  async getMemories(seniorId: string, filters?: MemoryFilters): Promise<Memory[]> {
    return this.repository.findBySeniorId(seniorId, filters);
  }

  /**
   * Search memories by keyword/phrase (basic text search)
   */
  async searchMemories(seniorId: string, query: string, limit: number = 10): Promise<Memory[]> {
    if (!query || query.trim() === '') {
      throw new Error('Search query is required');
    }

    return this.repository.searchByContent(seniorId, query.trim(), limit);
  }

  /**
   * Search memories using semantic similarity (vector search)
   * Finds memories that are conceptually similar to the query
   */
  async searchMemoriesSemantic(seniorId: string, query: string, limit: number = 10): Promise<Memory[]> {
    if (!query || query.trim() === '') {
      throw new Error('Search query is required');
    }

    // Generate embedding for the search query
    const queryEmbedding = await this.embeddingAdapter.generateEmbedding(query.trim());

    // Perform vector similarity search
    return this.repository.searchBySimilarity(seniorId, queryEmbedding, limit);
  }

  /**
   * Delete a memory
   */
  async deleteMemory(memoryId: string): Promise<void> {
    const memory = await this.repository.findById(memoryId);
    if (!memory) {
      throw new Error(`Memory with id ${memoryId} not found`);
    }

    await this.repository.delete(memoryId);
  }

  /**
   * Build comprehensive conversation context for a senior
   */
  async buildContext(seniorId: string, scope: ContextScope = {}): Promise<ConversationContext> {
    const {
      includeSummaries = true,
      includeMemories = true,
      includeTopics = true,
      daysBack = 7,
      currentTopic,
    } = scope;

    const senior = await this.seniorProfiles.getById(seniorId);
    if (!senior) {
      throw new Error(`Senior with id ${seniorId} not found`);
    }

    const preferences = await this.seniorProfiles.getPreferences(seniorId);

    const context: ConversationContext = {
      recentSummaries: [],
      importantMemories: [],
      recentTopics: [],
      preferences,
      lastCallDate: undefined,
    };

    // Get recent conversation summaries
    if (includeSummaries) {
      const recentContext = await this.conversationManager.getRecentContext(seniorId, 5);
      context.recentSummaries = recentContext.recentSummaries;
      context.lastCallDate = recentContext.lastCallDate;
    }

    // Get important memories
    if (includeMemories) {
      if (currentTopic) {
        // Use semantic search if current topic is provided
        const topicRelevantMemories = await this.searchMemoriesSemantic(
          seniorId,
          currentTopic,
          10
        );
        context.importantMemories = topicRelevantMemories;
      } else {
        // Fall back to time-based + importance filtering
        const since = new Date();
        since.setDate(since.getDate() - daysBack);

        const memories = await this.repository.findBySeniorId(seniorId, {
          minImportance: 0.6, // Only important memories
          since,
          limit: 20,
        });

        context.importantMemories = memories;
      }
    }

    // Get recent topics
    if (includeTopics) {
      context.recentTopics = await this.getRecentTopics(seniorId, daysBack);
    }

    return context;
  }

  /**
   * Summarize a conversation using LLM
   * (Simplified version - in production, use LLM to generate summary)
   */
  async summarizeConversation(conversationId: string): Promise<string> {
    const conversation = await this.conversationManager.getById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation with id ${conversationId} not found`);
    }

    const turns = await this.conversationManager.getTurns(conversationId);

    if (turns.length === 0) {
      return 'No conversation recorded.';
    }

    // Simple summary: first and last exchanges
    const firstTurn = turns[0];
    const lastTurn = turns[turns.length - 1];

    return `Conversation with ${turns.length} turns. Topics discussed: ${this.extractTopics(turns).join(', ')}. Duration: ${this.calculateDuration(conversation.startedAt, conversation.endedAt)}`;
  }

  /**
   * Get recent topics discussed with a senior
   */
  async getRecentTopics(seniorId: string, days: number): Promise<string[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get recent conversation memories
    const memories = await this.repository.findBySeniorId(seniorId, {
      type: 'event',
      since,
      limit: 10,
    });

    // Extract topics from memory metadata
    const topics: string[] = [];
    for (const memory of memories) {
      if (memory.metadata?.topic) {
        topics.push(memory.metadata.topic);
      }
    }

    // Remove duplicates and return
    return [...new Set(topics)];
  }

  /**
   * Track a topic from a conversation
   */
  async trackTopic(seniorId: string, topic: string, conversationId: string): Promise<void> {
    await this.repository.create(seniorId, {
      type: 'event',
      content: `Discussed ${topic}`,
      source: conversationId,
      importance: 0.3,
      metadata: { topic },
    });
  }

  /**
   * Extract topics from conversation turns (simple keyword extraction)
   */
  private extractTopics(turns: any[]): string[] {
    // Simplified: would use NLP in production
    const keywords = ['gardening', 'family', 'health', 'reading', 'cooking', 'weather', 'news'];
    const found: string[] = [];

    for (const turn of turns) {
      const content = turn.content.toLowerCase();
      for (const keyword of keywords) {
        if (content.includes(keyword) && !found.includes(keyword)) {
          found.push(keyword);
        }
      }
    }

    return found.length > 0 ? found : ['general conversation'];
  }

  /**
   * Calculate conversation duration
   */
  private calculateDuration(start: Date, end?: Date): string {
    if (!end) return 'ongoing';

    const durationMs = end.getTime() - start.getTime();
    const minutes = Math.floor(durationMs / 60000);

    if (minutes < 1) return 'less than a minute';
    if (minutes === 1) return '1 minute';
    return `${minutes} minutes`;
  }
}
