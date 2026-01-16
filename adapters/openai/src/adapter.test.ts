import { describe, it, expect } from 'vitest';
import { OpenAIEmbeddingAdapter } from './adapter';

/**
 * Unit tests for OpenAIEmbeddingAdapter
 *
 * Note: Full integration tests require OPENAI_API_KEY environment variable.
 * These unit tests verify the adapter's interface and configuration.
 */
describe('OpenAIEmbeddingAdapter', () => {
  describe('constructor', () => {
    it('should create adapter with config', () => {
      const adapter = new OpenAIEmbeddingAdapter({
        apiKey: 'test-api-key',
      });

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(OpenAIEmbeddingAdapter);
    });

    it('should accept custom model', () => {
      const adapter = new OpenAIEmbeddingAdapter({
        apiKey: 'test-api-key',
        model: 'text-embedding-3-large',
      });

      expect(adapter).toBeDefined();
    });
  });

  describe('interface compliance', () => {
    it('should implement IEmbeddingAdapter interface', () => {
      const adapter = new OpenAIEmbeddingAdapter({
        apiKey: 'test-api-key',
      });

      expect(typeof adapter.generateEmbedding).toBe('function');
      expect(typeof adapter.generateEmbeddingsBatch).toBe('function');
    });
  });

  // Integration tests - require valid API key
  describe.skip('generateEmbedding (integration)', () => {
    it('should generate embedding for text', async () => {
      // Requires valid OPENAI_API_KEY
    });
  });

  describe.skip('generateEmbeddingsBatch (integration)', () => {
    it('should generate embeddings for multiple texts', async () => {
      // Requires valid OPENAI_API_KEY
    });
  });
});
