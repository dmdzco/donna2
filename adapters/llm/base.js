/**
 * Base LLM Adapter
 *
 * Unified interface for all LLM providers.
 * Each provider adapter extends this and handles its own quirks.
 */

export class LLMAdapter {
  constructor(config = {}) {
    this.config = config;
    this.modelName = config.modelName || 'unknown';
  }

  /**
   * Generate a response (non-streaming)
   * @param {string} systemPrompt - System instructions
   * @param {Array<{role: string, content: string}>} messages - Conversation history
   * @param {object} options - Generation options
   * @param {number} options.maxTokens - Maximum tokens to generate
   * @param {number} options.temperature - Temperature (0-1)
   * @returns {Promise<{text: string, usage: {inputTokens: number, outputTokens: number}}>} Generated text with token usage
   */
  async generate(systemPrompt, messages, options = {}) {
    throw new Error(`generate() not implemented for ${this.constructor.name}`);
  }

  /**
   * Stream a response
   * @param {string} systemPrompt - System instructions
   * @param {Array<{role: string, content: string}>} messages - Conversation history
   * @param {object} options - Generation options
   * @param {function(string): void} onChunk - Callback for each text chunk
   * @returns {Promise<{text: string, usage: {inputTokens: number, outputTokens: number}}>} Full generated text with token usage
   */
  async stream(systemPrompt, messages, options = {}, onChunk = () => {}) {
    throw new Error(`stream() not implemented for ${this.constructor.name}`);
  }

  /**
   * Get the model identifier
   * @returns {string}
   */
  getModelName() {
    return this.modelName;
  }

  /**
   * Check if this adapter is available (API key set, etc.)
   * @returns {boolean}
   */
  isAvailable() {
    return false;
  }
}

export default LLMAdapter;
