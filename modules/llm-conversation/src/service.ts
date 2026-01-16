import {
  IConversationEngine,
  IAnthropicAdapter,
  ConversationRequest,
  Senior,
  ConversationContext,
  LLMMessage,
} from '@donna/shared/interfaces';

/**
 * LLM Conversation Engine
 *
 * This module is responsible ONLY for generating Donna's responses.
 * It does NOT:
 * - Store conversations (that's Conversation Manager's job)
 * - Decide when to deliver reminders (that's Observer Agent's job)
 * - Fetch news or skills (that's Skills System's job)
 *
 * It ONLY:
 * - Builds the system prompt
 * - Generates contextual, empathetic responses
 * - Returns text (no side effects!)
 *
 * This separation allows us to:
 * - Swap LLM providers easily
 * - Test response generation in isolation
 * - Change conversation logic without affecting storage
 */
export class LLMConversationService implements IConversationEngine {
  constructor(private llmAdapter: IAnthropicAdapter) {}

  /**
   * Generate Donna's response to senior's message
   */
  async generateResponse(request: ConversationRequest): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(request.senior, request.context);

    // Convert conversation history to LLM messages
    const messages: LLMMessage[] = request.conversationHistory.map(turn => ({
      role: turn.speaker === 'senior' ? 'user' : 'assistant',
      content: turn.content,
    }));

    // Add current user message
    messages.push({
      role: 'user',
      content: request.userMessage,
    });

    // Generate response using LLM
    const response = await this.llmAdapter.chat(messages, systemPrompt, {
      maxTokens: 300,
      temperature: 0.7,
    });

    return response;
  }

  /**
   * Generate streaming response (for real-time applications)
   */
  async *generateResponseStream(
    request: ConversationRequest
  ): AsyncIterable<string> {
    const systemPrompt = this.buildSystemPrompt(request.senior, request.context);

    const messages: LLMMessage[] = request.conversationHistory.map(turn => ({
      role: turn.speaker === 'senior' ? 'user' : 'assistant',
      content: turn.content,
    }));

    messages.push({
      role: 'user',
      content: request.userMessage,
    });

    // Stream response chunks
    for await (const chunk of this.llmAdapter.chatStream(messages, systemPrompt, {
      maxTokens: 300,
      temperature: 0.7,
    })) {
      yield chunk;
    }
  }

  /**
   * Build system prompt with senior's context
   */
  buildSystemPrompt(senior: Senior, context: ConversationContext): string {
    const age = senior.dateOfBirth
      ? Math.floor(
          (Date.now() - senior.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        )
      : undefined;

    let prompt = `You are Donna, a warm and friendly AI companion for elderly individuals. You're having a phone conversation with ${senior.name}.

PERSONALITY:
- Patient, kind, and genuinely interested in their life
- Speak clearly and at a comfortable pace
- Use their name occasionally to keep the conversation personal
- Be encouraging and positive
- Listen actively and ask thoughtful follow-up questions

SENIOR'S PROFILE:
- Name: ${senior.name}`;

    if (age) {
      prompt += `\n- Age: ${age} years old`;
    }

    if (senior.locationCity && senior.locationState) {
      prompt += `\n- Location: ${senior.locationCity}, ${senior.locationState}`;
    }

    if (senior.interests.length > 0) {
      prompt += `\n- Interests: ${senior.interests.join(', ')}`;
    }

    if (senior.familyInfo) {
      prompt += `\n- Family: ${JSON.stringify(senior.familyInfo)}`;
    }

    // Add pending reminders if any
    if (context.pendingReminders && context.pendingReminders.length > 0) {
      prompt += `\n\nREMINDERS TO DELIVER (work these naturally into conversation):`;
      context.pendingReminders.forEach(reminder => {
        prompt += `\n- ${reminder.title}${reminder.description ? `: ${reminder.description}` : ''}`;
      });
    }

    // Add recent news if any
    if (context.recentNews && context.recentNews.length > 0) {
      prompt += `\n\nINTERESTING NEWS TO SHARE (mention if relevant to conversation):`;
      context.recentNews.forEach(news => {
        prompt += `\n- ${news.title}: ${news.summary} (${news.relevance})`;
      });
    }

    // Add observer signals if any
    if (context.observerSignals) {
      const signals = context.observerSignals;

      if (signals.shouldDeliverReminder && signals.reminderToDeliver) {
        prompt += `\n\nIMPORTANT: Now is a good time to mention: ${signals.reminderToDeliver}`;
      }

      if (signals.suggestedTransition) {
        prompt += `\n\nSUGGESTED TOPIC: ${signals.suggestedTransition}`;
      }

      if (signals.shouldEndCall) {
        prompt += `\n\nIMPORTANT: Start wrapping up the conversation naturally. Reason: ${signals.endCallReason}`;
      }
    }

    prompt += `\n\nCONVERSATION GUIDELINES:
- Keep responses concise (2-3 sentences typically)
- Ask one question at a time
- If they seem confused, gently clarify
- If they seem tired or want to end, wrap up gracefully
- Deliver reminders naturally, not as a checklist
- Share interesting news when relevant to the conversation topic
- Don't force news items - only mention if it flows naturally`;

    return prompt;
  }
}
