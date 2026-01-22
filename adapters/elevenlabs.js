/**
 * ElevenLabs TTS Adapter
 * Converts text to speech using ElevenLabs API
 */

import { applyVolumeGain } from '../audio-utils.js';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Voice IDs for ElevenLabs
// Rachel is a warm, mature female voice suitable for Donna
const VOICE_IDS = {
  river: 'SAz9YHcvj6GT2YYXdXww',     // River - default
  rachel: '21m00Tcm4TlvDq8ikWAM',    // Rachel - warm, mature
  domi: 'AZnzlk1XvdvUeBnXmlld',      // Domi - younger
  bella: 'EXAVITQu4vr4xnSDxMaL',     // Bella - soft
  elli: 'MF3mGyEYCl7XYWbV9V6O',      // Elli - middle aged
  sarah: 'EXAVITQu4vr4xnSDxMaL',     // Sarah - warm professional
};

export class ElevenLabsAdapter {
  constructor(apiKey = process.env.ELEVENLABS_API_KEY) {
    this.apiKey = apiKey;
    this.voiceId = VOICE_IDS.river; // Default to River
    this.modelId = 'eleven_turbo_v2_5'; // Fast, low latency model
    this.speed = 0.8;  // Speech speed: 0.7 (slow) to 1.2 (fast)
    this.volume = 1.0; // Volume gain: 0.5 (-6dB) to 2.0 (+6dB)
  }

  /**
   * Set the voice to use
   * @param {string} voiceId - ElevenLabs voice ID or preset name
   */
  setVoice(voiceId) {
    if (VOICE_IDS[voiceId]) {
      this.voiceId = VOICE_IDS[voiceId];
    } else {
      this.voiceId = voiceId;
    }
  }

  /**
   * Set speech speed
   * @param {number} speed - Speed multiplier: 0.7 (slow) to 1.2 (fast), default 1.0
   */
  setSpeed(speed) {
    this.speed = Math.max(0.7, Math.min(1.2, speed));
  }

  /**
   * Set volume gain
   * @param {number} volume - Volume multiplier: 0.5 (-6dB) to 2.0 (+6dB), default 1.0
   */
  setVolume(volume) {
    this.volume = Math.max(0.5, Math.min(2.0, volume));
  }

  /**
   * Convert text to speech
   * @param {string} text - Text to convert
   * @returns {Promise<Buffer>} - Audio data as PCM buffer
   */
  async textToSpeech(text) {
    if (!this.apiKey) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    const response = await fetch(
      `${ELEVENLABS_API_URL}/text-to-speech/${this.voiceId}?output_format=pcm_24000`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            speed: this.speed,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    let pcmBuffer = Buffer.from(arrayBuffer);

    // Apply volume gain if not default
    if (this.volume !== 1.0) {
      pcmBuffer = applyVolumeGain(pcmBuffer, this.volume);
    }

    return pcmBuffer;
  }

  /**
   * Convert text to speech with streaming
   * @param {string} text - Text to convert
   * @param {function} onChunk - Callback for each audio chunk
   * @returns {Promise<void>}
   */
  async textToSpeechStream(text, onChunk) {
    if (!this.apiKey) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    const response = await fetch(
      `${ELEVENLABS_API_URL}/text-to-speech/${this.voiceId}/stream?output_format=pcm_24000`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            speed: this.speed,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
    }

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      let pcmBuffer = Buffer.from(value);
      // Apply volume gain if not default
      if (this.volume !== 1.0) {
        pcmBuffer = applyVolumeGain(pcmBuffer, this.volume);
      }
      onChunk(pcmBuffer);
    }
  }

  /**
   * Get available voices
   * @returns {Promise<Array>}
   */
  async getVoices() {
    if (!this.apiKey) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      headers: {
        'xi-api-key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get voices: ${response.status}`);
    }

    const data = await response.json();
    return data.voices;
  }
}

// Export singleton instance
export const elevenlabs = new ElevenLabsAdapter();
