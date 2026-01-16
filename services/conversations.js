import { db } from '../db/client.js';
import { conversations } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

export const conversationService = {
  // Create a new conversation record
  async create(data) {
    const [conversation] = await db.insert(conversations).values({
      seniorId: data.seniorId,
      callSid: data.callSid,
      startedAt: data.startedAt || new Date(),
      status: 'in_progress',
    }).returning();

    console.log(`[Conversation] Created: ${conversation.id} for call ${data.callSid}`);
    return conversation;
  },

  // Update conversation when call ends
  async complete(callSid, data) {
    const [conversation] = await db.update(conversations)
      .set({
        endedAt: new Date(),
        durationSeconds: data.durationSeconds,
        status: data.status || 'completed',
        summary: data.summary,
        transcript: data.transcript,
        sentiment: data.sentiment,
        concerns: data.concerns,
      })
      .where(eq(conversations.callSid, callSid))
      .returning();

    if (conversation) {
      console.log(`[Conversation] Completed: ${conversation.id} (${data.durationSeconds}s)`);
    }
    return conversation;
  },

  // Get conversation by call SID
  async getByCallSid(callSid) {
    const [conversation] = await db.select().from(conversations)
      .where(eq(conversations.callSid, callSid));
    return conversation || null;
  },

  // Get recent conversations for a senior
  async getForSenior(seniorId, limit = 10) {
    return db.select().from(conversations)
      .where(eq(conversations.seniorId, seniorId))
      .orderBy(desc(conversations.startedAt))
      .limit(limit);
  },

  // Get all recent conversations
  async getRecent(limit = 20) {
    return db.select().from(conversations)
      .orderBy(desc(conversations.startedAt))
      .limit(limit);
  }
};
