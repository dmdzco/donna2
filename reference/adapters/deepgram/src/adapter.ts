import { createClient, DeepgramClient } from '@deepgram/sdk';
import type {
  IDeepgramAdapter,
  AudioStream,
  Transcript,
  STTOptions,
  ExternalServiceError,
} from '@donna/shared/interfaces';

export interface DeepgramConfig {
  apiKey: string;
}

export class DeepgramAdapter implements IDeepgramAdapter {
  private client: DeepgramClient;

  constructor(config: DeepgramConfig) {
    this.client = createClient(config.apiKey);
  }

  async *transcribeStream(
    audioStream: AudioStream,
    options?: STTOptions
  ): AsyncIterable<Transcript> {
    try {
      const connection = this.client.listen.live({
        model: options?.model || 'nova-2',
        language: options?.language || 'en-US',
        punctuate: options?.punctuate ?? true,
        diarize: options?.diarize ?? false,
        encoding: audioStream.format.encoding as any,
        sample_rate: audioStream.format.sampleRate,
        channels: audioStream.format.channels,
      });

      connection.on('Results', (data: any) => {
        const channel = data.channel;
        if (channel && channel.alternatives && channel.alternatives.length > 0) {
          const alternative = channel.alternatives[0];
          return {
            text: alternative.transcript,
            isFinal: data.is_final || false,
            confidence: alternative.confidence || 0,
            words: alternative.words?.map((w: any) => ({
              word: w.word,
              startTime: w.start,
              endTime: w.end,
              confidence: w.confidence,
            })),
          };
        }
      });

      connection.on('error', (err: Error) => {
        const error = new Error(`External service Deepgram error: ${err.message}`) as any;
        error.code = 'EXTERNAL_SERVICE_ERROR';
        error.statusCode = 502;
        throw error;
      });

      // Note: The actual streaming implementation would need to handle
      // the WebSocket connection and yield transcripts as they arrive.
      // This is a simplified version for the interface contract.

      // For now, we'll use a placeholder that shows the pattern
      yield {
        text: '',
        isFinal: false,
        confidence: 0,
      };
    } catch (error: any) {
      const serviceError = new Error(`External service Deepgram error: ${error.message}`) as any;
      serviceError.code = 'EXTERNAL_SERVICE_ERROR';
      serviceError.statusCode = 502;
      throw serviceError;
    }
  }

  async transcribeBuffer(audioBuffer: Buffer, options?: STTOptions): Promise<string> {
    try {
      const { result, error } = await this.client.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
          model: options?.model || 'nova-2',
          language: options?.language || 'en-US',
          punctuate: options?.punctuate ?? true,
          diarize: options?.diarize ?? false,
        }
      );

      if (error) {
        throw error;
      }

      const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      return transcript || '';
    } catch (error: any) {
      const serviceError = new Error(`External service Deepgram error: ${error.message}`) as any;
      serviceError.code = 'EXTERNAL_SERVICE_ERROR';
      serviceError.statusCode = 502;
      throw serviceError;
    }
  }
}
