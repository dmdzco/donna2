import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const DONNA_SYSTEM_PROMPT = `You are Donna, a warm and caring AI companion for elderly individuals.

Your personality:
- Speak slowly and clearly
- Be patient and understanding
- Show genuine interest in their day and wellbeing
- Ask follow-up questions to keep the conversation going
- Keep responses SHORT (1-2 sentences) - this is a phone call
- Be conversational and natural

Remember details they share and reference them later in the conversation.`;

export class GeminiVoiceSession {
  constructor(seniorInfo = null) {
    this.seniorInfo = seniorInfo;
    this.chat = null;
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
        prompt += `\nHealth notes to be aware of: ${this.seniorInfo.medicalNotes}`;
      }
    }

    return prompt;
  }

  async initialize() {
    // Create model with system instruction
    this.model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: this.getSystemPrompt(),
    });

    this.chat = this.model.startChat({
      history: [],
    });
  }

  async generateResponse(userText) {
    if (!this.chat) {
      await this.initialize();
    }

    try {
      this.conversationHistory.push({ role: 'user', content: userText });

      const result = await this.chat.sendMessage(userText);
      const response = result.response.text();

      this.conversationHistory.push({ role: 'assistant', content: response });

      return response;
    } catch (error) {
      console.error('Gemini error:', error);
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
    if (this.conversationHistory.length < 2) {
      return null;
    }

    const transcript = this.conversationHistory
      .map(turn => `${turn.role === 'user' ? 'Senior' : 'Donna'}: ${turn.content}`)
      .join('\n');

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(`
Summarize this conversation in 2-3 sentences. Note any important details, concerns, or things to remember:

${transcript}

Summary:`);
      return result.response.text();
    } catch (error) {
      console.error('Summary error:', error);
      return null;
    }
  }

  async detectConcerns() {
    if (this.conversationHistory.length < 2) {
      return [];
    }

    const transcript = this.conversationHistory
      .map(turn => `${turn.role === 'user' ? 'Senior' : 'Donna'}: ${turn.content}`)
      .join('\n');

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(`
Analyze this conversation for any health or wellbeing concerns. Return a JSON array of concerns, or empty array if none.
Only include genuine concerns, not casual mentions.

${transcript}

Return only valid JSON array like: ["concern 1", "concern 2"] or []`);

      const text = result.response.text().trim();
      // Extract JSON from response (handle markdown code blocks)
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
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(`
Classify the user's intent. Return ONLY one of: CONTINUE, GOODBYE, EMERGENCY, CONFUSED

User said: "${userText}"

Intent:`);

      const intent = result.response.text().trim().toUpperCase();
      if (['CONTINUE', 'GOODBYE', 'EMERGENCY', 'CONFUSED'].includes(intent)) {
        return intent;
      }
      return 'CONTINUE';
    } catch (error) {
      return 'CONTINUE';
    }
  }

  getHistory() {
    return this.conversationHistory;
  }
}
