import type {
  IConversationManager,
  Conversation,
  ConversationData,
  ConversationWithTurns,
  ConversationContext,
  ConversationContinuity,
  TurnData,
  Turn,
  NotFoundError,
} from '@donna/shared/interfaces';
import type { IConversationRepository } from './repository';

export class ConversationManagerService implements IConversationManager {
  constructor(private repository: IConversationRepository) {}

  async create(data: ConversationData): Promise<Conversation> {
    return this.repository.create({
      seniorId: data.seniorId,
      callSid: data.callSid,
      initiatedBy: data.type === 'scheduled' ? 'scheduled' : 'manual',
      metadata: data.reminderIds ? { reminderIds: data.reminderIds } : undefined,
    });
  }

  async addTurn(conversationId: string, turn: TurnData): Promise<void> {
    await this.repository.addTurn(conversationId, turn);
  }

  async getHistory(seniorId: string, limit: number = 10): Promise<Conversation[]> {
    return this.repository.findBySeniorId(seniorId, limit);
  }

  async getById(conversationId: string): Promise<ConversationWithTurns> {
    const conversation = await this.repository.findById(conversationId);
    if (!conversation) {
      const error = new Error(`Conversation with id ${conversationId} not found`) as any;
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const turns = await this.repository.getTurns(conversationId);

    return {
      ...conversation,
      turns,
    };
  }

  async getTurns(conversationId: string): Promise<Turn[]> {
    return this.repository.getTurns(conversationId);
  }

  async updateSummary(conversationId: string, summary: string, sentiment?: string): Promise<void> {
    await this.repository.update(conversationId, {
      summary,
      sentiment,
    });
  }

  async flagConcern(conversationId: string, concern: string): Promise<void> {
    const conversation = await this.repository.findById(conversationId);
    if (!conversation) {
      const error = new Error(`Conversation with id ${conversationId} not found`) as any;
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const concerns = [...conversation.concerns, concern];
    await this.repository.update(conversationId, { concerns });
  }

  async markReminderDelivered(conversationId: string, reminderId: string): Promise<void> {
    const conversation = await this.repository.findById(conversationId);
    if (!conversation) {
      const error = new Error(`Conversation with id ${conversationId} not found`) as any;
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const remindersDelivered = [...conversation.remindersDelivered, reminderId];
    await this.repository.update(conversationId, { remindersDelivered });
  }

  async getRecentContext(seniorId: string, limit: number = 5): Promise<ConversationContext> {
    const conversations = await this.repository.findBySeniorId(seniorId, limit);

    const recentSummaries = conversations
      .filter(c => c.summary)
      .map(c => c.summary!);

    const lastCallDate = conversations.length > 0
      ? conversations[0].startedAt
      : undefined;

    // Extract topics from summaries (simple keyword extraction)
    const recentTopics: string[] = [];

    // Get conversation continuity
    const continuity = await this.getContinuity(seniorId);

    return {
      recentSummaries,
      importantMemories: [], // Would be populated by Memory module if implemented
      recentTopics,
      preferences: {} as any, // Would be populated by Senior Profiles module
      lastCallDate,
      continuity,
    };
  }

  /**
   * Get conversation continuity - last N turns across all calls for a senior.
   * This persists across call endings/drops and provides context for the next call.
   */
  async getContinuity(seniorId: string, limit: number = 10): Promise<ConversationContinuity> {
    // Get recent turns across all conversations
    const recentTurns = await this.repository.getRecentTurnsAcrossCalls(seniorId, limit);

    // Find the senior's most recent turn (what they last said/wanted)
    const lastSeniorTurn = [...recentTurns]
      .reverse()
      .find(turn => turn.speaker === 'senior');

    // Check if the last conversation was dropped (ended without proper completion)
    const conversations = await this.repository.findBySeniorId(seniorId, 1);
    const lastConversation = conversations[0];
    const lastCallDropped = lastConversation
      ? lastConversation.status === 'failed' ||
        (lastConversation.status === 'in_progress' &&
         lastConversation.startedAt < new Date(Date.now() - 30 * 60 * 1000)) // stale > 30min
      : false;

    // Get the most recent interaction timestamp
    const lastInteractionAt = recentTurns.length > 0
      ? recentTurns[recentTurns.length - 1].timestamp
      : undefined;

    return {
      recentTurns,
      lastSeniorTurn,
      lastCallDropped,
      lastInteractionAt,
    };
  }
}
