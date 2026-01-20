/**
 * Gemini LLM Adapter
 *
 * Handles Google's Gemini models.
 *
 * Quirks handled:
 * - systemInstruction breaks on gemini-3-flash-preview, so we inject as messages
 * - First message must be from user role
 * - Role names: 'user' and 'model' (not 'assistant')
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMAdapter } from './base.js';

export class GeminiAdapter extends LLMAdapter {
  constructor(config = {}) {
    super(config);
    this.modelName = config.modelName || 'gemini-3-flash-preview';
    this.client = null;

    if (process.env.GOOGLE_API_KEY) {
      this.client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    }
  }

  isAvailable() {
    return !!this.client;
  }

  /**
   * Prepare messages for Gemini format
   * - Injects system prompt as first user/model exchange
   * - Converts 'assistant' role to 'model'
   * - Ensures first message is from user
   */
  _prepareMessages(systemPrompt, messages) {
    // Skip leading assistant messages (Gemini requires first = user)
    let startIdx = 0;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        startIdx = i;
        break;
      }
    }
    const relevantMessages = messages.slice(startIdx);

    // Prepend system prompt as first user message
    // (systemInstruction parameter breaks on some Gemini models)
    const allMessages = [
      { role: 'user', content: `Instructions: ${systemPrompt}\n\nAcknowledge and follow these.` },
      { role: 'assistant', content: 'Understood. I will follow these instructions.' },
      ...relevantMessages
    ];

    // Convert to Gemini format
    return allMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  }

  async generate(systemPrompt, messages, options = {}) {
    if (!this.client) {
      throw new Error('Gemini client not initialized - missing GOOGLE_API_KEY');
    }

    const { maxTokens = 100, temperature = 0.7 } = options;

    const model = this.client.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    });

    const geminiMessages = this._prepareMessages(systemPrompt, messages);
    const history = geminiMessages.slice(0, -1);
    const lastMessage = geminiMessages[geminiMessages.length - 1];

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.parts[0].text);

    return result.response.text();
  }

  async stream(systemPrompt, messages, options = {}, onChunk = () => {}) {
    if (!this.client) {
      throw new Error('Gemini client not initialized - missing GOOGLE_API_KEY');
    }

    const { maxTokens = 100, temperature = 0.7 } = options;

    const model = this.client.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    });

    const geminiMessages = this._prepareMessages(systemPrompt, messages);
    const history = geminiMessages.slice(0, -1);
    const lastMessage = geminiMessages[geminiMessages.length - 1];

    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(lastMessage.parts[0].text);

    let fullResponse = '';

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        fullResponse += text;
        onChunk(text);
      }
    }

    return fullResponse;
  }
}

export default GeminiAdapter;
