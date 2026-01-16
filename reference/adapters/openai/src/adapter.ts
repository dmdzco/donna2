import OpenAI from 'openai';
import type { IEmbeddingAdapter } from '@donna/shared/interfaces';

/**
 * Error thrown when an external service fails
 */
class ExternalServiceError extends Error {
  constructor(service: string, message: string) {
    super(`External service ${service} error: ${message}`);
    this.name = 'ExternalServiceError';
  }
}

export interface OpenAIConfig {
  apiKey: string;
  model?: string; // Default: 'text-embedding-3-small'
}

/**
 * OpenAI Embeddings Adapter
 *
 * Wraps OpenAI's embedding API for generating vector embeddings of text.
 * Used for semantic search in the Memory & Context module.
 */
export class OpenAIEmbeddingAdapter implements IEmbeddingAdapter {
  private client: OpenAI;
  private model: string;

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
    this.model = config.model || 'text-embedding-3-small'; // 1536 dimensions, cheaper than ada-002
  }

  /**
   * Generate an embedding vector for a single text string
   * @param text - The text to generate an embedding for
   * @returns Embedding vector (1536 dimensions)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
        encoding_format: 'float',
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data returned from OpenAI');
      }

      return response.data[0].embedding;
    } catch (error: any) {
      throw new ExternalServiceError(
        'OpenAI',
        error.message || 'Failed to generate embedding'
      );
    }
  }

  /**
   * Generate embeddings for multiple texts in a batch
   * More efficient than calling generateEmbedding() multiple times
   * @param texts - Array of texts to generate embeddings for
   * @returns Array of embedding vectors
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    try {
      // OpenAI API supports up to 2048 input texts per request
      if (texts.length > 2048) {
        throw new Error('Cannot generate embeddings for more than 2048 texts at once');
      }

      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
        encoding_format: 'float',
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data returned from OpenAI');
      }

      // Return embeddings in the same order as input texts
      return response.data.map(item => item.embedding);
    } catch (error: any) {
      throw new ExternalServiceError(
        'OpenAI',
        error.message || 'Failed to generate embeddings batch'
      );
    }
  }
}
