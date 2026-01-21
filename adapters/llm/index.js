/**
 * LLM Adapter Factory
 *
 * Provides a unified way to get LLM adapters by model name.
 * Handles model aliases and fallbacks.
 */

import { GeminiAdapter } from './gemini.js';
import { ClaudeAdapter } from './claude.js';
export { LLMAdapter } from './base.js';
export { GeminiAdapter } from './gemini.js';
export { ClaudeAdapter } from './claude.js';

/**
 * Model registry - maps model names to adapter classes and configs
 */
const MODEL_REGISTRY = {
  // Gemini models
  'gemini-3-flash': {
    AdapterClass: GeminiAdapter,
    config: { modelName: 'gemini-3-flash-preview' },
  },
  'gemini-3-flash-preview': {
    AdapterClass: GeminiAdapter,
    config: { modelName: 'gemini-3-flash-preview' },
  },
  'gemini-2.0-flash': {
    AdapterClass: GeminiAdapter,
    config: { modelName: 'gemini-2.0-flash' },
  },
  'gemini-1.5-flash': {
    AdapterClass: GeminiAdapter,
    config: { modelName: 'gemini-1.5-flash' },
  },
  'gemini-1.5-pro': {
    AdapterClass: GeminiAdapter,
    config: { modelName: 'gemini-1.5-pro' },
  },
  'gemini-3-pro': {
    AdapterClass: GeminiAdapter,
    config: { modelName: 'gemini-3-pro-preview' },
  },

  // Claude models
  'claude-sonnet': {
    AdapterClass: ClaudeAdapter,
    config: { modelName: 'claude-sonnet-4-20250514' },
  },
  'claude-sonnet-4': {
    AdapterClass: ClaudeAdapter,
    config: { modelName: 'claude-sonnet-4-20250514' },
  },
  'claude-sonnet-4-20250514': {
    AdapterClass: ClaudeAdapter,
    config: { modelName: 'claude-sonnet-4-20250514' },
  },
  'claude-haiku': {
    AdapterClass: ClaudeAdapter,
    config: { modelName: 'claude-haiku-4-5-20241022' },
  },
  'claude-haiku-4-5': {
    AdapterClass: ClaudeAdapter,
    config: { modelName: 'claude-haiku-4-5-20241022' },
  },
  // Legacy Haiku versions
  'claude-3-5-haiku': {
    AdapterClass: ClaudeAdapter,
    config: { modelName: 'claude-3-5-haiku-20241022' },
  },
  'claude-3-haiku': {
    AdapterClass: ClaudeAdapter,
    config: { modelName: 'claude-3-haiku-20240307' },
  },
  'claude-opus': {
    AdapterClass: ClaudeAdapter,
    config: { modelName: 'claude-3-opus-20240229' },
  },
};

// Adapter instance cache (reuse instances)
const adapterCache = new Map();

/**
 * Get an LLM adapter by model name
 * @param {string} modelName - Model name or alias
 * @returns {LLMAdapter} Adapter instance
 */
export function getAdapter(modelName) {
  // Check cache first
  if (adapterCache.has(modelName)) {
    return adapterCache.get(modelName);
  }

  // Look up in registry
  const entry = MODEL_REGISTRY[modelName];
  if (!entry) {
    throw new Error(`Unknown model: ${modelName}. Available: ${Object.keys(MODEL_REGISTRY).join(', ')}`);
  }

  // Create and cache adapter
  const adapter = new entry.AdapterClass(entry.config);
  adapterCache.set(modelName, adapter);

  return adapter;
}

/**
 * Check if a model is available (API key configured)
 * @param {string} modelName - Model name or alias
 * @returns {boolean}
 */
export function isModelAvailable(modelName) {
  try {
    const adapter = getAdapter(modelName);
    return adapter.isAvailable();
  } catch {
    return false;
  }
}

/**
 * Get list of available models (with API keys configured)
 * @returns {string[]}
 */
export function getAvailableModels() {
  return Object.keys(MODEL_REGISTRY).filter(name => isModelAvailable(name));
}

/**
 * Model name constants for easy reference
 */
export const MODELS = {
  // Gemini
  GEMINI_3_FLASH: 'gemini-3-flash',
  GEMINI_3_PRO: 'gemini-3-pro',
  GEMINI_2_FLASH: 'gemini-2.0-flash',
  GEMINI_1_5_FLASH: 'gemini-1.5-flash',
  GEMINI_1_5_PRO: 'gemini-1.5-pro',

  // Claude
  CLAUDE_SONNET: 'claude-sonnet',
  CLAUDE_HAIKU: 'claude-haiku',
  CLAUDE_OPUS: 'claude-opus',
};

export default {
  getAdapter,
  isModelAvailable,
  getAvailableModels,
  MODELS,
};
