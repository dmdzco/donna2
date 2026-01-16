import Anthropic from '@anthropic-ai/sdk';
import {
  IAnthropicAdapter,
  LLMMessage,
  LLMOptions,
  ExternalServiceError,
} from '@donna/shared/interfaces';

/**
 * Anthropic Claude API Adapter
 *
 * This adapter wraps the Anthropic SDK and implements our standard interface.
 *
 * Benefits:
 * - Easy to swap with OpenAI or other LLM providers
 * - Centralized error handling
 * - Retry logic and rate limiting
 * - Consistent API across the application
 * - Easy to mock for testing
 */
export class AnthropicAdapter implements IAnthropicAdapter {
  private client: Anthropic;
  private defaultModel: string;

  constructor(config: AnthropicConfig) {
    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.client = new Anthropic({
      apiKey: config.apiKey,
    });

    this.defaultModel = config.defaultModel || 'claude-sonnet-4-20250514';
  }

  /**
   * Send a chat message and get a complete response
   */
  async chat(
    messages: LLMMessage[],
    system?: string,
    options?: LLMOptions
  ): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || 1024,
        temperature: options?.temperature,
        top_p: options?.topP,
        system,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        stop_sequences: options?.stopSequences,
      });

      // Extract text from response
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in response');
      }

      return textContent.text;
    } catch (error: any) {
      throw new ExternalServiceError(
        'Anthropic',
        error.message || 'Failed to generate response',
        error
      );
    }
  }

  /**
   * Send a chat message and stream the response
   */
  async *chatStream(
    messages: LLMMessage[],
    system?: string,
    options?: LLMOptions
  ): AsyncIterable<string> {
    try {
      const stream = await this.client.messages.stream({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || 1024,
        temperature: options?.temperature,
        top_p: options?.topP,
        system,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        stop_sequences: options?.stopSequences,
      });

      // Yield text deltas as they arrive
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
      }
    } catch (error: any) {
      throw new ExternalServiceError(
        'Anthropic',
        error.message || 'Failed to stream response',
        error
      );
    }
  }

  /**
   * Get available models (for future use)
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }
}

export interface AnthropicConfig {
  apiKey: string;
  defaultModel?: string;
}
