import { db } from '../db/client.js';
import { conversations, seniors } from '../db/schema.js';
import { eq, desc, and, sql } from 'drizzle-orm';

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

  // Get recent conversation history for context (across calls)
  async getRecentHistory(seniorId, messageLimit = 6) {
    // Get last few completed conversations with transcripts
    const recentCalls = await db.select({
      transcript: conversations.transcript,
      startedAt: conversations.startedAt,
    })
    .from(conversations)
    .where(and(
      eq(conversations.seniorId, seniorId),
      eq(conversations.status, 'completed'),
      sql`transcript IS NOT NULL`
    ))
    .orderBy(desc(conversations.startedAt))
    .limit(2); // Last 2 calls

    if (recentCalls.length === 0) return [];

    // Extract messages from transcripts (most recent first)
    const allMessages = [];
    for (const call of recentCalls) {
      try {
        const transcript = typeof call.transcript === 'string'
          ? JSON.parse(call.transcript)
          : call.transcript;

        if (Array.isArray(transcript)) {
          // Take last few messages from each call
          const messages = transcript.slice(-4).map(m => ({
            role: m.role,
            content: m.content,
            fromPreviousCall: true
          }));
          allMessages.push(...messages);
        }
      } catch (e) {
        // Skip malformed transcripts
      }
    }

    // Return most recent messages up to limit
    return allMessages.slice(-messageLimit);
  },

  // Get all recent conversations with senior names
  async getRecent(limit = 20) {
    const results = await db.select({
      id: conversations.id,
      seniorId: conversations.seniorId,
      callSid: conversations.callSid,
      startedAt: conversations.startedAt,
      endedAt: conversations.endedAt,
      durationSeconds: conversations.durationSeconds,
      status: conversations.status,
      summary: conversations.summary,
      sentiment: conversations.sentiment,
      concerns: conversations.concerns,
      transcript: conversations.transcript,
      seniorName: seniors.name,
    })
    .from(conversations)
    .leftJoin(seniors, eq(conversations.seniorId, seniors.id))
    .orderBy(desc(conversations.startedAt))
    .limit(limit);

    return results;
  }
};
