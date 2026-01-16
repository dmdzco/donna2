/**
 * Memory Provider Interface
 * Abstract base for memory storage/retrieval (PostgreSQL+pgvector, Pinecone, etc.)
 *
 * To swap providers, implement this interface and change the factory
 */

export class MemoryProvider {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Store a new memory
   * @param {string} seniorId - User identifier
   * @param {Object} memory - { type, content, importance, metadata }
   * @returns {Object} - Stored memory with ID
   */
  async store(seniorId, memory) {
    throw new Error('Not implemented');
  }

  /**
   * Semantic search for relevant memories
   * @param {string} seniorId - User identifier
   * @param {string} query - Search query
   * @param {Object} options - { limit, minSimilarity }
   * @returns {Array} - Matching memories
   */
  async search(seniorId, query, options = {}) {
    throw new Error('Not implemented');
  }

  /**
   * Get recent memories
   * @param {string} seniorId - User identifier
   * @param {number} limit - Max results
   * @returns {Array} - Recent memories
   */
  async getRecent(seniorId, limit = 10) {
    throw new Error('Not implemented');
  }

  /**
   * Get important memories
   * @param {string} seniorId - User identifier
   * @param {number} limit - Max results
   * @returns {Array} - Important memories
   */
  async getImportant(seniorId, limit = 5) {
    throw new Error('Not implemented');
  }

  /**
   * Build context string for conversation
   * @param {string} seniorId - User identifier
   * @param {string} currentTopic - Optional topic for relevance search
   * @returns {string} - Formatted context string
   */
  async buildContext(seniorId, currentTopic = null) {
    throw new Error('Not implemented');
  }

  /**
   * Extract and store memories from conversation transcript
   * @param {string} seniorId - User identifier
   * @param {string} transcript - Conversation transcript
   * @param {string} conversationId - Reference ID
   */
  async extractFromTranscript(seniorId, transcript, conversationId) {
    throw new Error('Not implemented');
  }
}
