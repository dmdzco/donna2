import { ElevenLabsClient } from 'elevenlabs';
import type {
  IElevenLabsAdapter,
  AudioBuffer,
  AudioChunk,
  TTSOptions,
  Voice,
} from '@donna/shared/interfaces';

export interface ElevenLabsConfig {
  apiKey: string;
  defaultVoiceId?: string;
}

export class ElevenLabsAdapter implements IElevenLabsAdapter {
  private client: ElevenLabsClient;
  private defaultVoiceId: string;

  constructor(config: ElevenLabsConfig) {
    this.client = new ElevenLabsClient({ apiKey: config.apiKey });
    this.defaultVoiceId = config.defaultVoiceId || 'rachel';
  }

  async synthesize(
    text: string,
    voiceId: string,
    options?: TTSOptions
  ): Promise<AudioBuffer> {
    try {
      const audio = await this.client.generate({
        voice: voiceId || this.defaultVoiceId,
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: options?.stability ?? 0.7,
          similarity_boost: options?.similarityBoost ?? 0.75,
        },
      });

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audio) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error: any) {
      const serviceError = new Error(
        `External service ElevenLabs error: ${error.message}`
      ) as any;
      serviceError.code = 'EXTERNAL_SERVICE_ERROR';
      serviceError.statusCode = 502;
      throw serviceError;
    }
  }

  async *synthesizeStream(
    text: string,
    voiceId: string,
    options?: TTSOptions
  ): AsyncIterable<AudioChunk> {
    try {
      const audio = await this.client.generate({
        voice: voiceId || this.defaultVoiceId,
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: options?.stability ?? 0.7,
          similarity_boost: options?.similarityBoost ?? 0.75,
        },
        stream: true,
      });

      for await (const chunk of audio) {
        yield {
          data: Buffer.from(chunk),
          isLast: false,
        };
      }

      // Send final marker
      yield {
        data: Buffer.alloc(0),
        isLast: true,
      };
    } catch (error: any) {
      const serviceError = new Error(
        `External service ElevenLabs error: ${error.message}`
      ) as any;
      serviceError.code = 'EXTERNAL_SERVICE_ERROR';
      serviceError.statusCode = 502;
      throw serviceError;
    }
  }

  async listVoices(): Promise<Voice[]> {
    try {
      const voices = await this.client.voices.getAll();
      return voices.voices.map((v) => ({
        voiceId: v.voice_id,
        name: v.name || 'Unknown Voice',
        category: v.category || 'general',
      }));
    } catch (error: any) {
      const serviceError = new Error(
        `External service ElevenLabs error: ${error.message}`
      ) as any;
      serviceError.code = 'EXTERNAL_SERVICE_ERROR';
      serviceError.statusCode = 502;
      throw serviceError;
    }
  }
}
