/**
 * Voice Provider Interface
 * Abstract base for voice AI providers (Gemini, OpenAI Realtime, etc.)
 *
 * To swap providers, implement this interface and change the factory
 */

export class VoiceProvider {
  constructor(config = {}) {
    this.config = config;
    this.onTranscript = null;  // Callback: (role, text) => void
    this.onAudio = null;       // Callback: (audioBase64) => void
    this.onError = null;       // Callback: (error) => void
  }

  /**
   * Initialize the provider with user context
   * @param {Object} context - { senior, memories, systemPrompt }
   */
  async initialize(context) {
    throw new Error('Not implemented');
  }

  /**
   * Send audio input to the provider
   * @param {string} audioBase64 - Base64 encoded audio
   */
  sendAudio(audioBase64) {
    throw new Error('Not implemented');
  }

  /**
   * Send text input to the provider (for prompts)
   * @param {string} text - Text to send
   */
  sendText(text) {
    throw new Error('Not implemented');
  }

  /**
   * Inject new context mid-conversation (e.g., retrieved memories)
   * @param {string} context - Additional context to inject
   */
  injectContext(context) {
    throw new Error('Not implemented');
  }

  /**
   * Get conversation transcript
   * @returns {Array} - [{role, content, timestamp}]
   */
  getTranscript() {
    throw new Error('Not implemented');
  }

  /**
   * Close the session
   */
  async close() {
    throw new Error('Not implemented');
  }
}
