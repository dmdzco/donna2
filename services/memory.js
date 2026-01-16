import OpenAI from 'openai';
import { db } from '../db/client.js';
import { memories } from '../db/schema.js';
import { eq, sql, desc, and } from 'drizzle-orm';
import { newsService } from './news.js';

let openai = null;
const getOpenAI = () => {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[Memory] OPENAI_API_KEY not set - memory features disabled');
      return null;
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
};

export const memoryService = {
  // Generate embedding for text using OpenAI
  async generateEmbedding(text) {
    const client = getOpenAI();
    if (!client) return null;
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  },

  // Store a new memory with embedding
  async store(seniorId, type, content, source = null, importance = 50, metadata = null) {
    const embedding = await this.generateEmbedding(content);
    if (!embedding) {
      console.log('[Memory] Skipping store - OpenAI not configured');
      return null;
    }

    const [memory] = await db.insert(memories).values({
      seniorId,
      type,
      content,
      source,
      importance,
      embedding,
      metadata,
    }).returning();

    console.log(`[Memory] Stored: "${content.substring(0, 50)}..." for senior ${seniorId}`);
    return memory;
  },

  // Semantic search - find memories similar to query
  async search(seniorId, query, limit = 5, minSimilarity = 0.7) {
    const queryEmbedding = await this.generateEmbedding(query);
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

    // Update last accessed time for retrieved memories
    if (results.rows.length > 0) {
      const ids = results.rows.map(r => r.id);
      await db.execute(sql`
        UPDATE memories
        SET last_accessed_at = NOW()
        WHERE id = ANY(${ids}::uuid[])
      `);
    }

    return results.rows;
  },

  // Get recent memories for a senior
  async getRecent(seniorId, limit = 10) {
    return db.select().from(memories)
      .where(eq(memories.seniorId, seniorId))
      .orderBy(desc(memories.createdAt))
      .limit(limit);
  },

  // Get important memories for a senior
  async getImportant(seniorId, limit = 5) {
    return db.select().from(memories)
      .where(and(
        eq(memories.seniorId, seniorId),
        sql`importance >= 70`
      ))
      .orderBy(desc(memories.importance))
      .limit(limit);
  },

  // Build context string for conversation
  async buildContext(seniorId, currentTopic = null, senior = null) {
    const contextParts = [];

    // Get relevant memories if there's a topic
    if (currentTopic) {
      const relevant = await this.search(seniorId, currentTopic, 3, 0.6);
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

    // Fetch news based on senior's interests
    if (senior?.interests?.length) {
      try {
        const newsContext = await newsService.getNewsForSenior(senior.interests);
        if (newsContext) {
          contextParts.push('\n' + newsContext);
        }
      } catch (error) {
        console.error('[Memory] Error fetching news:', error.message);
      }
    }

    return contextParts.join('\n');
  },

  // Extract and store memories from conversation
  async extractFromConversation(seniorId, transcript, conversationId) {
    // Use Gemini/OpenAI to extract facts and memories from transcript
    // This is called after a conversation ends

    const prompt = `Analyze this conversation and extract important facts, preferences, events, or concerns about the person. Return a JSON array of memories.

Conversation:
${transcript}

Return format:
[
  {"type": "fact|preference|event|concern|relationship", "content": "...", "importance": 50-100}
]

Only include genuinely important or memorable information. Be concise.`;

    try {
      const client = getOpenAI();
      if (!client) {
        console.log('[Memory] Skipping extraction - OpenAI not configured');
        return;
      }
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      const memoriesArray = result.memories || result;

      if (Array.isArray(memoriesArray)) {
        for (const mem of memoriesArray) {
          await this.store(
            seniorId,
            mem.type || 'fact',
            mem.content,
            conversationId,
            mem.importance || 50
          );
        }
        console.log(`[Memory] Extracted ${memoriesArray.length} memories from conversation`);
      }
    } catch (error) {
      console.error('[Memory] Failed to extract memories:', error);
    }
  }
};
