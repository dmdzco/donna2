import { describe, it, expect } from 'vitest';
import { DeepgramAdapter } from './adapter';

/**
 * Unit tests for DeepgramAdapter
 *
 * Note: Full integration tests require DEEPGRAM_API_KEY.
 */
describe('DeepgramAdapter', () => {
  describe('constructor', () => {
    it('should create adapter with config', () => {
      const adapter = new DeepgramAdapter({
        apiKey: 'test-api-key',
      });

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(DeepgramAdapter);
    });
  });

  describe('interface compliance', () => {
    it('should implement IDeepgramAdapter interface', () => {
      const adapter = new DeepgramAdapter({
        apiKey: 'test-api-key',
      });

      expect(typeof adapter.transcribeBuffer).toBe('function');
      expect(typeof adapter.transcribeStream).toBe('function');
    });
  });
});
