import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DONNA_SYSTEM_PROMPT = `You are Donna, a warm and caring AI companion for elderly individuals.

Your personality:
- Speak slowly and clearly
- Be patient and understanding
- Show genuine interest in their day and wellbeing
- Ask follow-up questions to keep the conversation going
- Keep responses SHORT (1-2 sentences) - this is a phone call
- Be conversational and natural

Remember details they share and reference them later in the conversation.`;

export class ClaudeVoiceSession {
  constructor(seniorInfo = null) {
    this.seniorInfo = seniorInfo;
    this.conversationHistory = [];
  }

  getSystemPrompt() {
    let prompt = DONNA_SYSTEM_PROMPT;

    if (this.seniorInfo) {
      prompt += `\n\nIMPORTANT - You are speaking with ${this.seniorInfo.name}.`;
      if (this.seniorInfo.interests?.length) {
        prompt += `\nTheir interests include: ${this.seniorInfo.interests.join(', ')}`;
      }
      if (this.seniorInfo.medicalNotes) {
        prompt += `\nHealth notes: ${this.seniorInfo.medicalNotes}`;
      }
    }

    return prompt;
  }

  async generateResponse(userText) {
    this.conversationHistory.push({ role: 'user', content: userText });

    try {
      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: this.getSystemPrompt(),
        messages: this.conversationHistory,
      });

      const assistantMessage = response.content[0].text;
      this.conversationHistory.push({ role: 'assistant', content: assistantMessage });

      return assistantMessage;
    } catch (error) {
      console.error('Claude error:', error);
      return "I'm sorry, I didn't catch that. Could you please repeat?";
    }
  }

  async generateGreeting() {
    const prompt = this.seniorInfo
      ? `Generate a warm greeting for ${this.seniorInfo.name}. You're calling to check on them.`
      : 'Someone just called. Generate a warm, friendly greeting.';

    return this.generateResponse(prompt);
  }

  async generateSummary() {
    if (this.conversationHistory.length < 2) return null;

    try {
      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: 'Summarize conversations concisely. Note important details and any concerns.',
        messages: [{
          role: 'user',
          content: `Summarize this conversation:\n${this.conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}`
        }]
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Summary error:', error);
      return null;
    }
  }

  async detectConcerns() {
    if (this.conversationHistory.length < 2) return [];

    try {
      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: 'Analyze conversations for health/wellbeing concerns. Return only a JSON array.',
        messages: [{
          role: 'user',
          content: `List any health or wellbeing concerns from this conversation as a JSON array (or [] if none):\n${this.conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}`
        }]
      });

      const text = response.content[0].text.trim();
      const jsonMatch = text.match(/\[.*\]/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (error) {
      console.error('Concern detection error:', error);
      return [];
    }
  }

  async detectIntent(userText) {
    try {
      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 20,
        system: 'Classify intent as exactly one of: CONTINUE, GOODBYE, EMERGENCY, CONFUSED. Return only the word.',
        messages: [{ role: 'user', content: `User said: "${userText}"` }]
      });

      const intent = response.content[0].text.trim().toUpperCase();
      return ['CONTINUE', 'GOODBYE', 'EMERGENCY', 'CONFUSED'].includes(intent) ? intent : 'CONTINUE';
    } catch (error) {
      return 'CONTINUE';
    }
  }

  getHistory() {
    return this.conversationHistory;
  }
}
