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

// Voice IDs for ElevenLabs
const VOICE_IDS = {
  rachel: '21m00Tcm4TlvDq8ikWAM',    // Rachel - warm, mature
  domi: 'AZnzlk1XvdvUeBnXmlld',      // Domi - younger
  bella: 'EXAVITQu4vr4xnSDxMaL',     // Bella - soft
  elli: 'MF3mGyEYCl7XYWbV9V6O',      // Elli - middle aged
};

export class ElevenLabsStreamingTTS {
  constructor(apiKey = process.env.ELEVENLABS_API_KEY) {
    this.apiKey = apiKey;
    this.voiceId = VOICE_IDS.rachel;
    this.modelId = 'eleven_turbo_v2_5';
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
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
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
            const audioBuffer = Buffer.from(message.audio, 'base64');
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
            this.onAudioChunk(data);
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
