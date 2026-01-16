import { describe, it, expect } from 'vitest';
import { ElevenLabsAdapter } from './adapter';

/**
 * Unit tests for ElevenLabsAdapter
 *
 * Note: Full integration tests require ELEVENLABS_API_KEY.
 */
describe('ElevenLabsAdapter', () => {
  describe('constructor', () => {
    it('should create adapter with config', () => {
      const adapter = new ElevenLabsAdapter({
        apiKey: 'test-api-key',
      });

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(ElevenLabsAdapter);
    });

    it('should accept custom default voice', () => {
      const adapter = new ElevenLabsAdapter({
        apiKey: 'test-api-key',
        defaultVoiceId: 'custom-voice',
      });

      expect(adapter).toBeDefined();
    });
  });

  describe('interface compliance', () => {
    it('should implement IElevenLabsAdapter interface', () => {
      const adapter = new ElevenLabsAdapter({
        apiKey: 'test-api-key',
      });

      expect(typeof adapter.synthesize).toBe('function');
      expect(typeof adapter.synthesizeStream).toBe('function');
      expect(typeof adapter.listVoices).toBe('function');
    });
  });
});
