/**
 * PostgreSQL Memory Provider
 * Implementation of MemoryProvider using PostgreSQL + pgvector + OpenAI embeddings
 */

import OpenAI from 'openai';
import { db } from '../db/client.js';
import { memories } from '../db/schema.js';
import { eq, sql, desc, and, inArray } from 'drizzle-orm';
import { MemoryProvider } from './memory-provider.js';

export class PostgresMemoryProvider extends MemoryProvider {
  constructor(config = {}) {
    super(config);
    this.openai = null;
    this.embeddingModel = config.embeddingModel || 'text-embedding-3-small';
    this.extractionModel = config.extractionModel || 'gpt-4o-mini';
  }

  _getOpenAI() {
    if (!this.openai) {
      if (!process.env.OPENAI_API_KEY) {
        console.warn('[PostgresMemory] OPENAI_API_KEY not set - memory features disabled');
        return null;
      }
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  async _generateEmbedding(text) {
    const client = this._getOpenAI();
    if (!client) return null;

    const response = await client.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });
    return response.data[0].embedding;
  }

  async store(seniorId, memory) {
    const { type, content, importance = 50, source = null, metadata = null } = memory;

    const embedding = await this._generateEmbedding(content);
    if (!embedding) {
      console.log('[PostgresMemory] Skipping store - embeddings not available');
      return null;
    }

    const [stored] = await db.insert(memories).values({
      seniorId,
      type,
      content,
      source,
      importance,
      embedding,
      metadata,
    }).returning();

    console.log(`[PostgresMemory] Stored: "${content.substring(0, 50)}..." for senior ${seniorId}`);
    return stored;
  }

  async search(seniorId, query, options = {}) {
    const { limit = 5, minSimilarity = 0.7 } = options;

    const queryEmbedding = await this._generateEmbedding(query);
    if (!queryEmbedding) return [];

    const results = await db.execute(sql`
      SELECT
        id,
        type,
        content,
        importance,
        metadata,
        created_at,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM memories
      WHERE senior_id = ${seniorId}
        AND 1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) > ${minSimilarity}
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit}
    `);

    // Update last accessed time
    if (results.rows.length > 0) {
      const ids = results.rows.map(r => r.id);
      await db.update(memories)
        .set({ lastAccessedAt: new Date() })
        .where(inArray(memories.id, ids));
    }

    return results.rows;
  }

  async getRecent(seniorId, limit = 10) {
    return db.select().from(memories)
      .where(eq(memories.seniorId, seniorId))
      .orderBy(desc(memories.createdAt))
      .limit(limit);
  }

  async getImportant(seniorId, limit = 5) {
    return db.select().from(memories)
      .where(and(
        eq(memories.seniorId, seniorId),
        sql`importance >= 70`
      ))
      .orderBy(desc(memories.importance))
      .limit(limit);
  }

  async buildContext(seniorId, currentTopic = null) {
    const contextParts = [];

    // Get relevant memories if there's a topic
    if (currentTopic) {
      const relevant = await this.search(seniorId, currentTopic, { limit: 3, minSimilarity: 0.6 });
      if (relevant.length > 0) {
        contextParts.push('Relevant memories:');
        relevant.forEach(m => {
          contextParts.push(`- [${m.type}] ${m.content}`);
        });
      }
    }

    // Get important memories
    const important = await this.getImportant(seniorId, 3);
    if (important.length > 0) {
      contextParts.push('\nImportant to remember:');
      important.forEach(m => {
        contextParts.push(`- [${m.type}] ${m.content}`);
      });
    }

    // Get recent memories
    const recent = await this.getRecent(seniorId, 3);
    if (recent.length > 0) {
      contextParts.push('\nRecent context:');
      recent.forEach(m => {
        contextParts.push(`- [${m.type}] ${m.content}`);
      });
    }

    return contextParts.join('\n');
  }

  async extractFromTranscript(seniorId, transcript, conversationId) {
    const client = this._getOpenAI();
    if (!client) {
      console.log('[PostgresMemory] Skipping extraction - OpenAI not configured');
      return [];
    }

    const prompt = `Analyze this conversation and extract important facts, preferences, events, or concerns about the person. Return a JSON array of memories.

Conversation:
${transcript}

Return format:
[
  {"type": "fact|preference|event|concern|relationship", "content": "...", "importance": 50-100}
]

Only include genuinely important or memorable information. Be concise.`;

    try {
      const response = await client.chat.completions.create({
        model: this.extractionModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      const memoriesArray = result.memories || result;
      const stored = [];

      if (Array.isArray(memoriesArray)) {
        for (const mem of memoriesArray) {
          const memory = await this.store(seniorId, {
            type: mem.type || 'fact',
            content: mem.content,
            source: conversationId,
            importance: mem.importance || 50
          });
          if (memory) stored.push(memory);
        }
        console.log(`[PostgresMemory] Extracted ${stored.length} memories from conversation`);
      }

      return stored;
    } catch (error) {
      console.error('[PostgresMemory] Failed to extract memories:', error);
      return [];
    }
  }
}
