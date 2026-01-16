import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

interface Senior {
  name: string;
  date_of_birth?: string;
  location_city?: string;
  location_state?: string;
  interests: string[];
  family_info?: Record<string, any>;
  medical_notes?: string;
}

interface Reminder {
  id: string;
  type: string;
  title: string;
  description?: string;
}

interface NewsItem {
  title: string;
  summary: string;
  source: string;
  relevance: string;
  url?: string;
}

interface ConversationTurn {
  speaker: 'donna' | 'senior';
  content: string;
}

interface ObserverSignal {
  should_deliver_reminder: boolean;
  reminder_to_deliver?: string;
  suggested_transition?: string;
  should_end_call: boolean;
  end_call_reason?: string;
}

export class ConversationAgent {
  private senior: Senior;
  private reminders: Reminder[];
  private newsItems: NewsItem[];
  private conversationHistory: ConversationTurn[] = [];
  private deliveredReminders: Set<string> = new Set();

  constructor(senior: Senior, reminders: Reminder[], newsItems: NewsItem[] = []) {
    this.senior = senior;
    this.reminders = reminders;
    this.newsItems = newsItems;
  }

  private buildSystemPrompt(observerSignal?: ObserverSignal): string {
    const age = this.senior.date_of_birth
      ? Math.floor((Date.now() - new Date(this.senior.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : undefined;

    const pendingReminders = this.reminders.filter(r => !this.deliveredReminders.has(r.id));

    let prompt = `You are Donna, a warm and friendly AI companion for elderly individuals. You're having a phone conversation with ${this.senior.name}.

PERSONALITY:
- Patient, kind, and genuinely interested in their life
- Speak clearly and at a comfortable pace
- Use their name occasionally to keep the conversation personal
- Be encouraging and positive
- Listen actively and ask thoughtful follow-up questions

SENIOR'S PROFILE:
- Name: ${this.senior.name}
${age ? `- Age: ${age} years old` : ''}
${this.senior.location_city ? `- Location: ${this.senior.location_city}, ${this.senior.location_state}` : ''}
${this.senior.interests.length > 0 ? `- Interests: ${this.senior.interests.join(', ')}` : ''}
${this.senior.family_info ? `- Family: ${JSON.stringify(this.senior.family_info)}` : ''}

REMINDERS TO DELIVER (work these naturally into conversation):
${pendingReminders.map(r => `- ${r.title}${r.description ? `: ${r.description}` : ''}`).join('\n')}

${this.newsItems.length > 0 ? `INTERESTING NEWS TO SHARE (mention if relevant to conversation):
${this.newsItems.map(n => `- ${n.title}: ${n.summary} (${n.relevance})`).join('\n')}
` : ''}
CONVERSATION GUIDELINES:
- Keep responses concise (2-3 sentences typically)
- Ask one question at a time
- If they seem confused, gently clarify
- If they seem tired or want to end, wrap up gracefully
- Deliver reminders naturally, not as a checklist
- Share interesting news when relevant to the conversation topic
- Don't force news items - only mention if it flows naturally`;

    if (observerSignal) {
      if (observerSignal.should_deliver_reminder && observerSignal.reminder_to_deliver) {
        prompt += `\n\nIMPORTANT: Now is a good time to mention: ${observerSignal.reminder_to_deliver}`;
      }
      if (observerSignal.suggested_transition) {
        prompt += `\n\nSUGGESTED TOPIC: ${observerSignal.suggested_transition}`;
      }
      if (observerSignal.should_end_call) {
        prompt += `\n\nIMPORTANT: Start wrapping up the conversation naturally. Reason: ${observerSignal.end_call_reason}`;
      }
    }

    return prompt;
  }

  async respond(
    seniorMessage: string,
    observerSignal?: ObserverSignal
  ): Promise<string> {
    // Add senior's message to history
    this.conversationHistory.push({
      speaker: 'senior',
      content: seniorMessage,
    });

    // Build messages for API
    const messages = this.conversationHistory.map(turn => ({
      role: (turn.speaker === 'senior' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: turn.content,
    }));

    // Get response from Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: this.buildSystemPrompt(observerSignal),
      messages,
    });

    const assistantMessage = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    // Add response to history
    this.conversationHistory.push({
      speaker: 'donna',
      content: assistantMessage,
    });

    // Track delivered reminders (simple heuristic)
    for (const reminder of this.reminders) {
      if (assistantMessage.toLowerCase().includes(reminder.title.toLowerCase())) {
        this.deliveredReminders.add(reminder.id);
      }
    }

    return assistantMessage;
  }

  getConversationHistory(): ConversationTurn[] {
    return [...this.conversationHistory];
  }

  getDeliveredReminders(): string[] {
    return Array.from(this.deliveredReminders);
  }

  updateNewsItems(newsItems: NewsItem[]) {
    this.newsItems = newsItems;
  }

  getNewsItems(): NewsItem[] {
    return [...this.newsItems];
  }
}
