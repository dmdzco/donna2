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
    // Delegate to STT adapter
    yield* this.sttAdapter.transcribeStream(audioStream);
  }

  async transcribeBuffer(audioBuffer: Buffer, options?: any): Promise<string> {
    // Delegate to STT adapter
    return this.sttAdapter.transcribeBuffer(audioBuffer, options);
  }

  async synthesize(text: string, config?: VoiceConfig): Promise<AudioBuffer> {
    const voiceId = config?.voiceId || this.DEFAULT_VOICE_ID;
    const options: TTSOptions = {
      stability: config?.stability ?? this.DEFAULT_STABILITY,
      speed: config?.speed ?? this.DEFAULT_SPEED,
    };

    // Delegate to TTS adapter
    return this.ttsAdapter.synthesize(text, voiceId, options);
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

    // Delegate to TTS adapter
    yield* this.ttsAdapter.synthesizeStream(text, voiceId, options);
  }
}
