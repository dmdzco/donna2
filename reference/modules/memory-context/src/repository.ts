/**
 * Memory Repository
 *
 * Data access layer for senior memories and topics.
 */

import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { memories } from '@donna/database';
import type {
  Memory,
  MemoryData,
  MemoryFilters,
} from '@donna/shared/interfaces';

export interface IMemoryRepository {
  create(seniorId: string, data: MemoryData & { embedding?: number[] }): Promise<Memory>;
  findById(memoryId: string): Promise<Memory | null>;
  findBySeniorId(seniorId: string, filters?: MemoryFilters): Promise<Memory[]>;
  delete(memoryId: string): Promise<void>;
  searchByContent(seniorId: string, query: string, limit?: number): Promise<Memory[]>;
  searchBySimilarity(seniorId: string, queryEmbedding: number[], limit?: number): Promise<Memory[]>;
}

export class MemoryRepository implements IMemoryRepository {
  constructor(private db: NeonHttpDatabase) {}

  /**
   * Create a new memory
   */
  async create(seniorId: string, data: MemoryData & { embedding?: number[] }): Promise<Memory> {
    const values: any = {
      seniorId,
      type: data.type,
      content: data.content,
      source: data.source,
      importance: this.normalizeImportance(data.importance),
      metadata: data.metadata || {},
      timestamp: new Date(),
    };

    // Add embedding if provided
    if (data.embedding) {
      values.embedding = data.embedding;
    }

    const [result] = await this.db
      .insert(memories)
      .values(values)
      .returning();

    return this.mapToMemory(result);
  }

  /**
   * Find memory by ID
   */
  async findById(memoryId: string): Promise<Memory | null> {
    const result = await this.db
      .select()
      .from(memories)
      .where(eq(memories.id, memoryId))
      .limit(1);

    return result.length > 0 ? this.mapToMemory(result[0]) : null;
  }

  /**
   * Find all memories for a senior with optional filters
   */
  async findBySeniorId(seniorId: string, filters?: MemoryFilters): Promise<Memory[]> {
    const conditions = [eq(memories.seniorId, seniorId)];

    if (filters?.type) {
      conditions.push(eq(memories.type, filters.type));
    }

    if (filters?.minImportance !== undefined) {
      const normalizedMin = this.normalizeImportance(filters.minImportance);
      conditions.push(gte(memories.importance, normalizedMin));
    }

    if (filters?.since) {
      conditions.push(gte(memories.timestamp, filters.since));
    }

    let query = this.db
      .select()
      .from(memories)
      .where(and(...conditions))
      .orderBy(desc(memories.importance), desc(memories.timestamp));

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }

    const result = await query;

    return result.map(row => this.mapToMemory(row));
  }

  /**
   * Delete a memory
   */
  async delete(memoryId: string): Promise<void> {
    await this.db.delete(memories).where(eq(memories.id, memoryId));
  }

  /**
   * Search memories by content (basic text search)
   * Note: For production, consider using PostgreSQL full-text search or pgvector
   */
  async searchByContent(seniorId: string, query: string, limit: number = 10): Promise<Memory[]> {
    const result = await this.db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.seniorId, seniorId),
          sql`${memories.content} ILIKE ${'%' + query + '%'}`
        )
      )
      .orderBy(desc(memories.importance), desc(memories.timestamp))
      .limit(limit);

    return result.map(row => this.mapToMemory(row));
  }

  /**
   * Search memories by semantic similarity using pgvector
   * Uses cosine distance for similarity ranking
   */
  async searchBySimilarity(
    seniorId: string,
    queryEmbedding: number[],
    limit: number = 10
  ): Promise<Memory[]> {
    // Convert embedding array to pgvector format string
    const embeddingString = `[${queryEmbedding.join(',')}]`;

    const result = await this.db.execute(sql`
      SELECT *,
             1 - (embedding <=> ${embeddingString}::vector) as similarity
      FROM memories
      WHERE senior_id = ${seniorId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingString}::vector
      LIMIT ${limit}
    `);

    return result.rows.map((row: any) => this.mapToMemory(row));
  }

  /**
   * Map database row to Memory interface
   */
  private mapToMemory(row: any): Memory {
    return {
      id: row.id,
      seniorId: row.seniorId,
      type: row.type,
      content: row.content,
      source: row.source,
      timestamp: row.timestamp,
      importance: this.denormalizeImportance(row.importance),
      metadata: row.metadata || {},
    };
  }

  /**
   * Convert importance from 0.0-1.0 scale to 0-100 integer
   */
  private normalizeImportance(importance: number = 0.5): number {
    return Math.round(Math.max(0, Math.min(1, importance)) * 100);
  }

  /**
   * Convert importance from 0-100 integer to 0.0-1.0 scale
   */
  private denormalizeImportance(importance: number): number {
    return importance / 100;
  }
}
