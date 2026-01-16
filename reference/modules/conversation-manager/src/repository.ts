import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { eq, desc, asc } from 'drizzle-orm';
import { conversations, conversationTurns } from '@donna/database';
import type { Conversation, TurnData, Turn } from '@donna/shared/interfaces';

export interface IConversationRepository {
  create(data: CreateConversationData): Promise<Conversation>;
  findById(id: string): Promise<Conversation | null>;
  findBySeniorId(seniorId: string, limit?: number): Promise<Conversation[]>;
  addTurn(conversationId: string, turn: TurnData): Promise<void>;
  getTurns(conversationId: string): Promise<Turn[]>;
  update(id: string, data: Partial<UpdateConversationData>): Promise<Conversation>;
}

export interface CreateConversationData {
  seniorId: string;
  callSid?: string;
  startedAt?: Date;
  initiatedBy: 'scheduled' | 'manual' | 'senior_callback';
  metadata?: Record<string, any>;
}

export interface UpdateConversationData {
  callSid?: string;
  endedAt?: Date;
  durationSeconds?: number;
  status?: 'in_progress' | 'completed' | 'no_answer' | 'failed';
  audioUrl?: string;
  summary?: string;
  sentiment?: string;
  concerns?: string[];
  remindersDelivered?: string[];
  metadata?: Record<string, any>;
}

export class ConversationRepository implements IConversationRepository {
  constructor(private db: NeonHttpDatabase) {}

  async create(data: CreateConversationData): Promise<Conversation> {
    const [result] = await this.db
      .insert(conversations)
      .values({
        seniorId: data.seniorId,
        callSid: data.callSid,
        startedAt: data.startedAt || new Date(),
        status: 'in_progress',
        initiatedBy: data.initiatedBy,
        metadata: data.metadata || {},
      })
      .returning();

    return this.mapToConversation(result);
  }

  async findById(id: string): Promise<Conversation | null> {
    const result = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToConversation(result[0]);
  }

  async findBySeniorId(seniorId: string, limit: number = 10): Promise<Conversation[]> {
    const result = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.seniorId, seniorId))
      .orderBy(desc(conversations.startedAt))
      .limit(limit);

    return result.map((row) => this.mapToConversation(row));
  }

  async addTurn(conversationId: string, turn: TurnData): Promise<void> {
    await this.db
      .insert(conversationTurns)
      .values({
        conversationId,
        speaker: turn.speaker,
        content: turn.content,
        audioSegmentUrl: turn.audioUrl,
        observerSignals: turn.observerSignals || null,
        createdAt: turn.timestamp || new Date(),
      });
  }

  async getTurns(conversationId: string): Promise<Turn[]> {
    const result = await this.db
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.conversationId, conversationId))
      .orderBy(asc(conversationTurns.createdAt));

    return result.map((row) => ({
      speaker: row.speaker as 'donna' | 'senior',
      content: row.content,
      timestamp: new Date(row.createdAt!),
      audioUrl: row.audioSegmentUrl || undefined,
    }));
  }

  async update(id: string, data: Partial<UpdateConversationData>): Promise<Conversation> {
    const updateData: any = {};

    if (data.callSid !== undefined) updateData.callSid = data.callSid;
    if (data.endedAt !== undefined) updateData.endedAt = data.endedAt;
    if (data.durationSeconds !== undefined) updateData.durationSeconds = data.durationSeconds;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.audioUrl !== undefined) updateData.audioUrl = data.audioUrl;
    if (data.summary !== undefined) updateData.summary = data.summary;
    if (data.sentiment !== undefined) updateData.sentiment = data.sentiment;
    if (data.concerns !== undefined) updateData.concerns = data.concerns;
    if (data.remindersDelivered !== undefined) updateData.remindersDelivered = data.remindersDelivered;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    if (Object.keys(updateData).length === 0) {
      const current = await this.findById(id);
      if (!current) {
        throw new Error(`Conversation ${id} not found`);
      }
      return current;
    }

    const result = await this.db
      .update(conversations)
      .set(updateData)
      .where(eq(conversations.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error(`Conversation ${id} not found`);
    }

    return this.mapToConversation(result[0]);
  }

  private mapToConversation(row: any): Conversation {
    return {
      id: row.id,
      seniorId: row.seniorId,
      callSid: row.callSid,
      startedAt: new Date(row.startedAt),
      endedAt: row.endedAt ? new Date(row.endedAt) : undefined,
      durationSeconds: row.durationSeconds,
      status: row.status,
      initiatedBy: row.initiatedBy,
      audioUrl: row.audioUrl,
      summary: row.summary,
      sentiment: row.sentiment,
      concerns: row.concerns || [],
      remindersDelivered: row.remindersDelivered || [],
      metadata: row.metadata || {},
    };
  }
}
