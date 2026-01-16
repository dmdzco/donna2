import { put, del } from '@vercel/blob';
import type { IStorageAdapter } from '@donna/shared/interfaces';

export interface VercelBlobConfig {
  token: string; // BLOB_READ_WRITE_TOKEN
}

/**
 * Vercel Blob Storage Adapter
 *
 * Provides storage capabilities for conversation audio recordings.
 * Uses Vercel Blob for serverless, CDN-backed file storage.
 */
export class VercelBlobAdapter implements IStorageAdapter {
  constructor(private config: VercelBlobConfig) {}

  /**
   * Upload an audio file to Vercel Blob storage
   */
  async uploadAudio(
    conversationId: string,
    audioBuffer: Buffer,
    contentType: string
  ): Promise<string> {
    try {
      const filename = `conversations/${conversationId}/recording.${this.getExtension(contentType)}`;

      const blob = await put(filename, audioBuffer, {
        access: 'public',
        contentType,
        token: this.config.token,
      });

      console.log(`✓ Uploaded audio: ${filename} (${audioBuffer.length} bytes)`);

      return blob.url;
    } catch (error) {
      console.error('✗ Failed to upload audio to Vercel Blob:', error);
      throw new Error(`Failed to upload audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a signed/public URL for accessing a file
   * Note: Vercel Blob URLs are public by default when access: 'public'
   */
  async getSignedUrl(url: string, expiresIn?: number): Promise<string> {
    // Vercel Blob public URLs don't require signing
    // They are already accessible via CDN
    return url;
  }

  /**
   * Delete an audio file from Vercel Blob storage
   */
  async deleteAudio(url: string): Promise<void> {
    try {
      await del(url, {
        token: this.config.token,
      });

      console.log(`✓ Deleted audio: ${url}`);
    } catch (error) {
      console.error('✗ Failed to delete audio from Vercel Blob:', error);
      throw new Error(`Failed to delete audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get file extension from content type
   */
  private getExtension(contentType: string): string {
    const map: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/webm': 'webm',
    };

    return map[contentType] || 'mp3';
  }
}
