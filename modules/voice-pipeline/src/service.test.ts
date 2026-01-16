import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoicePipelineService } from './service';
import type {
  IDeepgramAdapter,
  IElevenLabsAdapter,
  AudioStream,
} from '@donna/shared/interfaces';

describe('VoicePipelineService', () => {
  let service: VoicePipelineService;
  let mockSTT: IDeepgramAdapter;
  let mockTTS: IElevenLabsAdapter;

  beforeEach(() => {
    mockSTT = {
      transcribeBuffer: vi.fn(),
      transcribeStream: vi.fn(),
    };

    mockTTS = {
      synthesize: vi.fn(),
      synthesizeStream: vi.fn(),
      listVoices: vi.fn(),
    };

    service = new VoicePipelineService(mockSTT, mockTTS);
  });

  describe('transcribeBuffer', () => {
    it('should delegate to STT adapter', async () => {
      (mockSTT.transcribeBuffer as any).mockResolvedValue('Hello world');

      const result = await service.transcribeBuffer(Buffer.from('audio'));

      expect(result).toBe('Hello world');
      expect(mockSTT.transcribeBuffer).toHaveBeenCalledWith(
        expect.any(Buffer),
        undefined
      );
    });

    it('should pass buffer correctly', async () => {
      (mockSTT.transcribeBuffer as any).mockResolvedValue('Test');
      const buffer = Buffer.from('test-audio-data');

      await service.transcribeBuffer(buffer);

      expect(mockSTT.transcribeBuffer).toHaveBeenCalledWith(buffer, undefined);
    });
  });

  describe('transcribeStream', () => {
    it('should stream transcripts from STT adapter', async () => {
      async function* mockStream() {
        yield { text: 'Hello', isFinal: false, confidence: 0.9 };
        yield { text: 'Hello world', isFinal: true, confidence: 0.95 };
      }

      (mockSTT.transcribeStream as any).mockReturnValue(mockStream());

      const audioStream: AudioStream = {
        data: Buffer.from('audio'),
        format: { encoding: 'linear16', sampleRate: 16000, channels: 1 },
      };

      const transcripts = [];
      for await (const t of service.transcribeStream(audioStream)) {
        transcripts.push(t);
      }

      expect(transcripts).toHaveLength(2);
      expect(transcripts[0].text).toBe('Hello');
      expect(transcripts[1].isFinal).toBe(true);
    });

    it('should pass audio stream to adapter', async () => {
      async function* emptyStream() {}
      (mockSTT.transcribeStream as any).mockReturnValue(emptyStream());

      const audioStream: AudioStream = {
        data: Buffer.from('test'),
        format: { encoding: 'linear16', sampleRate: 16000, channels: 1 },
      };

      // Consume the stream
      for await (const _ of service.transcribeStream(audioStream)) {
        // Just iterate
      }

      expect(mockSTT.transcribeStream).toHaveBeenCalledWith(audioStream);
    });
  });

  describe('synthesize', () => {
    it('should delegate to TTS adapter with default voice', async () => {
      (mockTTS.synthesize as any).mockResolvedValue(Buffer.from('audio'));

      const result = await service.synthesize('Hello');

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(mockTTS.synthesize).toHaveBeenCalledWith(
        'Hello',
        'default-elderly-friendly-voice',
        expect.objectContaining({
          stability: 0.7,
          speed: 1.0,
        })
      );
    });

    it('should use custom voice config', async () => {
      (mockTTS.synthesize as any).mockResolvedValue(Buffer.from('audio'));

      await service.synthesize('Test', {
        voiceId: 'custom-voice',
        stability: 0.9,
        speed: 1.2,
      });

      expect(mockTTS.synthesize).toHaveBeenCalledWith(
        'Test',
        'custom-voice',
        expect.objectContaining({
          stability: 0.9,
          speed: 1.2,
        })
      );
    });

    it('should use default values for missing config options', async () => {
      (mockTTS.synthesize as any).mockResolvedValue(Buffer.from('audio'));

      await service.synthesize('Test', {
        voiceId: 'custom-voice',
      });

      expect(mockTTS.synthesize).toHaveBeenCalledWith(
        'Test',
        'custom-voice',
        expect.objectContaining({
          stability: 0.7,
          speed: 1.0,
        })
      );
    });
  });

  describe('synthesizeStream', () => {
    it('should stream audio chunks from TTS adapter', async () => {
      async function* mockStream() {
        yield { data: Buffer.from([1, 2]), isLast: false };
        yield { data: Buffer.from([3, 4]), isLast: true };
      }

      (mockTTS.synthesizeStream as any).mockReturnValue(mockStream());

      const chunks = [];
      for await (const chunk of service.synthesizeStream('Test')) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[1].isLast).toBe(true);
    });

    it('should pass config to TTS adapter', async () => {
      async function* emptyStream() {}
      (mockTTS.synthesizeStream as any).mockReturnValue(emptyStream());

      // Consume the stream
      for await (const _ of service.synthesizeStream('Test', {
        voiceId: 'test-voice',
        stability: 0.8,
      })) {
        // Just iterate
      }

      expect(mockTTS.synthesizeStream).toHaveBeenCalledWith(
        'Test',
        'test-voice',
        expect.objectContaining({
          stability: 0.8,
          speed: 1.0,
        })
      );
    });

    it('should use default voice when not specified', async () => {
      async function* emptyStream() {}
      (mockTTS.synthesizeStream as any).mockReturnValue(emptyStream());

      // Consume the stream
      for await (const _ of service.synthesizeStream('Test')) {
        // Just iterate
      }

      expect(mockTTS.synthesizeStream).toHaveBeenCalledWith(
        'Test',
        'default-elderly-friendly-voice',
        expect.any(Object)
      );
    });
  });
});
