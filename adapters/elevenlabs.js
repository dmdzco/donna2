/**
 * ElevenLabs TTS Adapter
 * Converts text to speech using ElevenLabs API
 */

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Voice IDs for ElevenLabs
// Rachel is a warm, mature female voice suitable for Donna
const VOICE_IDS = {
  rachel: '21m00Tcm4TlvDq8ikWAM',    // Rachel - warm, mature
  domi: 'AZnzlk1XvdvUeBnXmlld',      // Domi - younger
  bella: 'EXAVITQu4vr4xnSDxMaL',     // Bella - soft
  elli: 'MF3mGyEYCl7XYWbV9V6O',      // Elli - middle aged
  sarah: 'EXAVITQu4vr4xnSDxMaL',     // Sarah - warm professional
};

export class ElevenLabsAdapter {
  constructor(apiKey = process.env.ELEVENLABS_API_KEY) {
    this.apiKey = apiKey;
    this.voiceId = VOICE_IDS.rachel; // Default to Rachel
    this.modelId = 'eleven_turbo_v2_5'; // Fast, low latency model
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
   * Convert text to speech
   * @param {string} text - Text to convert
   * @returns {Promise<Buffer>} - Audio data as PCM buffer
   */
  async textToSpeech(text) {
    if (!this.apiKey) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    const response = await fetch(
      `${ELEVENLABS_API_URL}/text-to-speech/${this.voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
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
            use_speaker_boost: true,
          },
          output_format: 'pcm_24000', // 24kHz PCM for conversion to mulaw
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
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
      `${ELEVENLABS_API_URL}/text-to-speech/${this.voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
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
            use_speaker_boost: true,
          },
          output_format: 'pcm_24000',
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
      onChunk(Buffer.from(value));
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
