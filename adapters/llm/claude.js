/**
 * Claude LLM Adapter
 *
 * Handles Anthropic's Claude models.
 *
 * Features:
 * - System prompt via dedicated 'system' parameter
 * - Native streaming support
 * - Handles all Claude models (Haiku, Sonnet, Opus)
 */

import Anthropic from '@anthropic-ai/sdk';
import { LLMAdapter } from './base.js';

export class ClaudeAdapter extends LLMAdapter {
  constructor(config = {}) {
    super(config);
    this.modelName = config.modelName || 'claude-sonnet-4-20250514';
    this.client = null;

    if (process.env.ANTHROPIC_API_KEY) {
      this.client = new Anthropic();
    }
  }

  isAvailable() {
    return !!this.client;
  }

  /**
   * Prepare messages for Claude format
   * Claude uses 'user' and 'assistant' roles (standard)
   */
  _prepareMessages(messages) {
    return messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  async generate(systemPrompt, messages, options = {}) {
    if (!this.client) {
      throw new Error('Claude client not initialized - missing ANTHROPIC_API_KEY');
    }

    const { maxTokens = 100, temperature = 0.7 } = options;

    const claudeMessages = this._prepareMessages(messages);

    const response = await this.client.messages.create({
      model: this.modelName,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: claudeMessages.length > 0 ? claudeMessages : [{ role: 'user', content: 'Hello' }],
    });

    // Filter out thinking blocks, only return text content
    const textBlock = response.content.find(block => block.type === 'text');
    return textBlock?.text || '';
  }

  async stream(systemPrompt, messages, options = {}, onChunk = () => {}) {
    if (!this.client) {
      throw new Error('Claude client not initialized - missing ANTHROPIC_API_KEY');
    }

    const { maxTokens = 100, temperature = 0.7 } = options;

    const claudeMessages = this._prepareMessages(messages);

    const stream = await this.client.messages.stream({
      model: this.modelName,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: claudeMessages.length > 0 ? claudeMessages : [{ role: 'user', content: 'Hello' }],
    });

    let fullResponse = '';
    let isThinkingBlock = false;

    for await (const event of stream) {
      // Track when we enter/exit thinking blocks (Claude 4.5 extended thinking)
      if (event.type === 'content_block_start') {
        isThinkingBlock = event.content_block?.type === 'thinking';
      }
      if (event.type === 'content_block_stop') {
        isThinkingBlock = false;
      }

      // Only output text deltas that aren't from thinking blocks
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && !isThinkingBlock) {
        const text = event.delta.text;
        fullResponse += text;
        onChunk(text);
      }
    }

    return fullResponse;
  }
}

export default ClaudeAdapter;
