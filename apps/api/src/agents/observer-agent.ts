import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

interface ConversationTurn {
  speaker: 'donna' | 'senior';
  content: string;
}

interface Reminder {
  id: string;
  type: string;
  title: string;
  description?: string;
}

export interface ObserverSignal {
  engagement_level: 'high' | 'medium' | 'low';
  emotional_state: string;
  should_deliver_reminder: boolean;
  reminder_to_deliver?: string;
  suggested_transition?: string;
  should_end_call: boolean;
  end_call_reason?: string;
  concerns: string[];
}

export class ObserverAgent {
  private seniorName: string;
  private pendingReminders: Reminder[];
  private callStartTime: Date;
  private maxCallDuration: number; // in minutes

  constructor(
    seniorName: string,
    reminders: Reminder[],
    maxCallDuration: number = 15
  ) {
    this.seniorName = seniorName;
    this.pendingReminders = reminders;
    this.callStartTime = new Date();
    this.maxCallDuration = maxCallDuration;
  }

  async analyze(
    conversationHistory: ConversationTurn[],
    deliveredReminderIds: string[]
  ): Promise<ObserverSignal> {
    // Filter out delivered reminders
    const remainingReminders = this.pendingReminders.filter(
      r => !deliveredReminderIds.includes(r.id)
    );

    // Calculate call duration
    const callDurationMinutes = (Date.now() - this.callStartTime.getTime()) / 60000;
    const approachingEndTime = callDurationMinutes > this.maxCallDuration * 0.8;

    const systemPrompt = `You are an observer monitoring a phone conversation between Donna (an AI companion) and ${this.seniorName} (an elderly person).

Your job is to analyze the conversation and provide guidance signals. You are NOT part of the conversation - you only observe and advise.

ANALYZE FOR:
1. Engagement level - Is the senior actively participating?
2. Emotional state - Are they happy, confused, tired, distressed?
3. Reminder opportunities - Good moments to naturally mention pending reminders
4. Topic suggestions - If conversation stalls, suggest transitions
5. End call signals - Signs they want to end, or natural endpoints
6. Concerns - Anything the caregiver should know about

PENDING REMINDERS (not yet delivered):
${remainingReminders.map(r => `- ${r.title}: ${r.description || 'No details'}`).join('\n') || 'None'}

CALL DURATION: ${Math.round(callDurationMinutes)} minutes
MAX RECOMMENDED DURATION: ${this.maxCallDuration} minutes
${approachingEndTime ? 'NOTE: Call is approaching recommended end time.' : ''}

Respond ONLY with valid JSON matching this schema:
{
  "engagement_level": "high" | "medium" | "low",
  "emotional_state": "brief description",
  "should_deliver_reminder": boolean,
  "reminder_to_deliver": "reminder title if applicable",
  "suggested_transition": "topic suggestion if needed",
  "should_end_call": boolean,
  "end_call_reason": "reason if should end",
  "concerns": ["list of concerns for caregiver"]
}`;

    const conversationText = conversationHistory
      .map(turn => `${turn.speaker.toUpperCase()}: ${turn.content}`)
      .join('\n');

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Analyze this conversation:\n\n${conversationText}`,
          },
        ],
      });

      const responseText = response.content[0].type === 'text'
        ? response.content[0].text
        : '{}';

      // Parse JSON response
      const signal = JSON.parse(responseText) as ObserverSignal;

      // Force end call if way over time
      if (callDurationMinutes > this.maxCallDuration * 1.2) {
        signal.should_end_call = true;
        signal.end_call_reason = 'Call duration exceeded recommended time';
      }

      return signal;
    } catch (error) {
      console.error('Observer agent error:', error);

      // Return safe defaults on error
      return {
        engagement_level: 'medium',
        emotional_state: 'unknown',
        should_deliver_reminder: false,
        should_end_call: approachingEndTime,
        end_call_reason: approachingEndTime ? 'Approaching time limit' : undefined,
        concerns: [],
      };
    }
  }

  updateReminders(reminders: Reminder[]) {
    this.pendingReminders = reminders;
  }
}
