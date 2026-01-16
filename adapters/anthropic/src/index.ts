/**
 * Anthropic Adapter
 *
 * Wraps the Anthropic SDK with our standard interface.
 * This allows us to easily:
 * - Swap to a different LLM provider
 * - Mock for testing
 * - Add retry logic and error handling
 */

export { AnthropicAdapter, AnthropicConfig } from './adapter';
export type { IAnthropicAdapter, LLMMessage, LLMOptions } from '@donna/shared/interfaces';
