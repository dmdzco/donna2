/**
 * Provider Factory
 * Central registry for swappable providers
 *
 * To swap a provider:
 * 1. Create new provider implementing the interface
 * 2. Update the factory function here
 * 3. No other code changes needed!
 */

import { GeminiVoiceProvider } from './gemini-voice-provider.js';
import { PostgresMemoryProvider } from './postgres-memory-provider.js';

// Provider instances (singletons)
let voiceProvider = null;
let memoryProvider = null;

/**
 * Get or create the voice provider
 * Change this function to swap voice providers
 */
export function getVoiceProvider(config = {}) {
  // SWAP HERE: Replace GeminiVoiceProvider with another implementation
  // e.g., OpenAIRealtimeProvider, ElevenLabsProvider, etc.
  return new GeminiVoiceProvider(config);
}

/**
 * Get or create the memory provider (singleton)
 * Change this function to swap memory providers
 */
export function getMemoryProvider(config = {}) {
  if (!memoryProvider) {
    // SWAP HERE: Replace PostgresMemoryProvider with another implementation
    // e.g., PineconeMemoryProvider, WeaviateProvider, etc.
    memoryProvider = new PostgresMemoryProvider(config);
  }
  return memoryProvider;
}

/**
 * Provider types for reference
 */
export const ProviderTypes = {
  VOICE: {
    GEMINI: 'gemini',
    // Future: OPENAI_REALTIME: 'openai-realtime',
    // Future: ELEVENLABS: 'elevenlabs',
  },
  MEMORY: {
    POSTGRES_PGVECTOR: 'postgres-pgvector',
    // Future: PINECONE: 'pinecone',
    // Future: WEAVIATE: 'weaviate',
  }
};

// Re-export interfaces for external implementations
export { VoiceProvider } from './voice-provider.js';
export { MemoryProvider } from './memory-provider.js';
