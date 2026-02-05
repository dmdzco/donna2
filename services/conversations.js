import { db } from '../db/client.js';
import { conversations, seniors } from '../db/schema.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import { createLogger } from '../lib/logger.js';

const log = createLogger('Conversation');

export const conversationService = {
  // Create a new conversation record
  async create(data) {
    const [conversation] = await db.insert(conversations).values({
      seniorId: data.seniorId,
      callSid: data.callSid,
      startedAt: data.startedAt || new Date(),
      status: 'in_progress',
    }).returning();

    log.info('Created', { id: conversation.id, callSid: data.callSid });
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
      log.info('Completed', { id: conversation.id, durationSeconds: data.durationSeconds });
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

  // Update conversation summary (called after post-call analysis)
  async updateSummary(callSid, summary) {
    try {
      const [conversation] = await db.update(conversations)
        .set({ summary })
        .where(eq(conversations.callSid, callSid))
        .returning();

      if (conversation) {
        log.info('Updated summary', { callSid });
      }
      return conversation;
    } catch (error) {
      log.error('Error updating summary', { callSid, error: error.message });
      return null;
    }
  },

  // Get recent call summaries for context (instead of raw messages)
  async getRecentSummaries(seniorId, limit = 3) {
    const recentCalls = await db.select({
      summary: conversations.summary,
      startedAt: conversations.startedAt,
      durationSeconds: conversations.durationSeconds,
    })
    .from(conversations)
    .where(and(
      eq(conversations.seniorId, seniorId),
      eq(conversations.status, 'completed'),
      sql`summary IS NOT NULL`,
      sql`summary != ''`
    ))
    .orderBy(desc(conversations.startedAt))
    .limit(limit);

    if (recentCalls.length === 0) return null;

    // Format as context string
    const summaries = recentCalls.map(call => {
      const daysAgo = Math.floor((Date.now() - new Date(call.startedAt).getTime()) / (1000 * 60 * 60 * 24));
      const timeAgo = daysAgo === 0 ? 'Earlier today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
      const duration = call.durationSeconds ? `(${Math.round(call.durationSeconds / 60)} min)` : '';
      return `- ${timeAgo} ${duration}: ${call.summary}`;
    });

    return summaries.join('\n');
  },

  // Legacy: Get recent conversation history for context (across calls)
  // Deprecated: Use getRecentSummaries instead
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
