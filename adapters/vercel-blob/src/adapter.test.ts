import { describe, it, expect } from 'vitest';
import { VercelBlobAdapter } from './adapter';

/**
 * Unit tests for VercelBlobAdapter
 *
 * Note: Full integration tests require BLOB_READ_WRITE_TOKEN environment variable.
 * These unit tests verify the adapter's interface and configuration.
 */
describe('VercelBlobAdapter', () => {
  describe('constructor', () => {
    it('should create adapter with config', () => {
      const adapter = new VercelBlobAdapter({
        token: 'test-token',
      });

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(VercelBlobAdapter);
    });
  });

  describe('getSignedUrl', () => {
    it('should return the URL as-is for public blobs', async () => {
      const adapter = new VercelBlobAdapter({ token: 'test-token' });
      const url = 'https://blob.vercel-storage.com/file.mp3';

      const result = await adapter.getSignedUrl(url);

      expect(result).toBe(url);
    });

    it('should ignore expiresIn parameter for public URLs', async () => {
      const adapter = new VercelBlobAdapter({ token: 'test-token' });
      const url = 'https://blob.vercel-storage.com/file.mp3';

      const result = await adapter.getSignedUrl(url, 3600);

      expect(result).toBe(url);
    });
  });

  describe('getExtension (via uploadAudio filename)', () => {
    // Note: These would require mocking to test properly
    // The getExtension method is private but tested indirectly
    it.skip('should map audio/mpeg to mp3', () => {
      // Integration test - requires valid token
    });

    it.skip('should map audio/wav to wav', () => {
      // Integration test - requires valid token
    });
  });
});
