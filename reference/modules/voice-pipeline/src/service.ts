import type {
  IVoicePipeline,
  IDeepgramAdapter,
  IElevenLabsAdapter,
  AudioStream,
  Transcript,
  AudioBuffer,
  AudioChunk,
  VoiceConfig,
  TTSOptions,
} from '@donna/shared/interfaces';
import { loggers } from '@donna/logger';

const log = loggers.voicePipeline;

export class VoicePipelineService implements IVoicePipeline {
  private readonly DEFAULT_VOICE_ID = 'default-elderly-friendly-voice';

  // Elderly-friendly defaults: slower speech for clarity
  private readonly DEFAULT_SPEED = 0.85; // Slower than normal (1.0) for better comprehension
  private readonly DEFAULT_STABILITY = 0.75; // Slightly higher stability for consistent, predictable voice

  constructor(
    private sttAdapter: IDeepgramAdapter,
    private ttsAdapter: IElevenLabsAdapter
  ) {}

  async *transcribeStream(audioStream: AudioStream): AsyncIterable<Transcript> {
    log.debug({ format: audioStream.format }, 'Starting streaming transcription');
    // Delegate to STT adapter
    yield* this.sttAdapter.transcribeStream(audioStream);
  }

  async transcribeBuffer(audioBuffer: Buffer, options?: any): Promise<string> {
    log.debug({ bufferSize: audioBuffer.length }, 'Transcribing audio buffer');
    // Delegate to STT adapter
    const result = await this.sttAdapter.transcribeBuffer(audioBuffer, options);
    log.debug({ textLength: result.length }, 'Transcription completed');
    return result;
  }

  async synthesize(text: string, config?: VoiceConfig): Promise<AudioBuffer> {
    const voiceId = config?.voiceId || this.DEFAULT_VOICE_ID;
    const options: TTSOptions = {
      stability: config?.stability ?? this.DEFAULT_STABILITY,
      speed: config?.speed ?? this.DEFAULT_SPEED,
    };

    log.debug({ textLength: text.length, voiceId }, 'Synthesizing speech');
    // Delegate to TTS adapter
    const result = await this.ttsAdapter.synthesize(text, voiceId, options);
    log.debug({ audioSize: result.length }, 'Speech synthesis completed');
    return result;
  }

  async *synthesizeStream(
    text: string,
    config?: VoiceConfig
  ): AsyncIterable<AudioChunk> {
    const voiceId = config?.voiceId || this.DEFAULT_VOICE_ID;
    const options: TTSOptions = {
      stability: config?.stability ?? this.DEFAULT_STABILITY,
      speed: config?.speed ?? this.DEFAULT_SPEED,
    };

    log.debug({ textLength: text.length, voiceId }, 'Starting streaming speech synthesis');
    // Delegate to TTS adapter
    yield* this.ttsAdapter.synthesizeStream(text, voiceId, options);
  }
}
