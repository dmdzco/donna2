/**
 * ElevenLabs WebSocket Streaming TTS Adapter
 * Provides ultra-low-latency text-to-speech via WebSocket connection
 *
 * Key features:
 * - WebSocket-based streaming for ~150ms time-to-first-audio
 * - Accepts text chunks as they arrive from Claude
 * - Returns audio chunks via callback for immediate playback
 */

import WebSocket from 'ws';
import { applyVolumeGain } from '../audio-utils.js';

// Voice IDs for ElevenLabs
const VOICE_IDS = {
  river: 'SAz9YHcvj6GT2YYXdXww',     // River - default
  rachel: '21m00Tcm4TlvDq8ikWAM',    // Rachel - warm, mature
  domi: 'AZnzlk1XvdvUeBnXmlld',      // Domi - younger
  bella: 'EXAVITQu4vr4xnSDxMaL',     // Bella - soft
  elli: 'MF3mGyEYCl7XYWbV9V6O',      // Elli - middle aged
};

export class ElevenLabsStreamingTTS {
  constructor(apiKey = process.env.ELEVENLABS_API_KEY) {
    this.apiKey = apiKey;
    this.voiceId = VOICE_IDS.river;
    this.modelId = 'eleven_turbo_v2_5';
    this.speed = 0.8;  // Speech speed: 0.7 (slow) to 1.2 (fast)
    this.volume = 1.0; // Volume gain: 0.5 (-6dB) to 2.0 (+6dB)
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.onAudioChunk = null; // Callback: (pcmBuffer) => void
    this.onError = null;      // Callback: (error) => void
    this.onClose = null;      // Callback: () => void
    this.pendingText = [];    // Buffer text if sent before connection ready
    this.connectionPromise = null;
  }

  /**
   * Set the voice to use
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
   * Connect to ElevenLabs WebSocket endpoint
   * Returns a promise that resolves when connection is ready
   */
  async connect() {
    if (this.isConnected) return;
    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    if (!this.apiKey) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    this.isConnecting = true;

    this.connectionPromise = new Promise((resolve, reject) => {
      const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=${this.modelId}&output_format=pcm_24000`;

      this.ws = new WebSocket(url, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      const timeout = setTimeout(() => {
        if (!this.isConnected) {
          this.ws?.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        console.log('[ElevenLabs-WS] Connected');

        // Send initial configuration
        this.ws.send(JSON.stringify({
          text: ' ',  // Initial space to prime the connection
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.75,
            style: 0.2,
            speed: this.speed,
            use_speaker_boost: true,
          },
          generation_config: {
            chunk_length_schedule: [120, 160, 250, 290],
          },
          xi_api_key: this.apiKey,
        }));

        this.isConnected = true;
        this.isConnecting = false;

        // Send any pending text
        for (const text of this.pendingText) {
          this.streamText(text);
        }
        this.pendingText = [];

        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.audio) {
            // Decode base64 audio and send to callback
            let audioBuffer = Buffer.from(message.audio, 'base64');
            // Apply volume gain if not default
            if (this.volume !== 1.0) {
              audioBuffer = applyVolumeGain(audioBuffer, this.volume);
            }
            if (this.onAudioChunk) {
              this.onAudioChunk(audioBuffer);
            }
          }

          if (message.isFinal) {
            // ElevenLabs signals end of audio for this text
            console.log('[ElevenLabs-WS] Audio generation complete');
          }

          if (message.error) {
            console.error('[ElevenLabs-WS] Error:', message.error);
            if (this.onError) {
              this.onError(new Error(message.error));
            }
          }
        } catch (e) {
          // Binary data or parse error - might be raw audio
          if (data instanceof Buffer && this.onAudioChunk) {
            let audioBuffer = data;
            // Apply volume gain if not default
            if (this.volume !== 1.0) {
              audioBuffer = applyVolumeGain(audioBuffer, this.volume);
            }
            this.onAudioChunk(audioBuffer);
          }
        }
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        console.error('[ElevenLabs-WS] WebSocket error:', error.message);
        this.isConnected = false;
        this.isConnecting = false;
        if (this.onError) {
          this.onError(error);
        }
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('[ElevenLabs-WS] Connection closed');
        this.isConnected = false;
        this.isConnecting = false;
        if (this.onClose) {
          this.onClose();
        }
      });
    });

    return this.connectionPromise;
  }

  /**
   * Stream a text chunk to TTS
   * Call this as text becomes available from Claude
   */
  streamText(text) {
    if (!text || text.trim().length === 0) return;

    if (!this.isConnected) {
      // Buffer text until connection is ready
      this.pendingText.push(text);
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        text: text,
        try_trigger_generation: true,
      }));
    }
  }

  /**
   * Signal end of text input
   * Call this when Claude's response is complete
   */
  flush() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        text: '',
        flush: true,
      }));
    }
  }

  /**
   * Close the WebSocket connection
   */
  close() {
    if (this.ws) {
      // Send flush before closing
      this.flush();

      // Give time for final audio chunks
      setTimeout(() => {
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
        this.isConnected = false;
        this.isConnecting = false;
        this.pendingText = [];
      }, 500);
    }
  }

  /**
   * Immediately terminate connection (for barge-in)
   */
  terminate() {
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.pendingText = [];
  }

  /**
   * Check if connection is ready
   */
  isReady() {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
}
