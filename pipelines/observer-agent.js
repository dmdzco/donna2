import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

/**
 * Observer Agent - Analyzes conversation and provides guidance signals
 * Runs in parallel with the main conversation, monitoring for:
 * - Engagement level
 * - Emotional state
 * - Reminder opportunities
 * - Topic suggestions
 * - End call signals
 * - Concerns for caregivers
 */
export class ObserverAgent {
  constructor(seniorName, reminders = [], maxCallDuration = 15) {
    this.seniorName = seniorName;
    this.pendingReminders = reminders;
    this.callStartTime = new Date();
    this.maxCallDuration = maxCallDuration; // in minutes
    this.deliveredReminderIds = new Set();
  }

  /**
   * Analyze current conversation state and return guidance signals
   * @param {Array<{role: string, content: string}>} conversationHistory
   * @returns {Promise<ObserverSignal>}
   */
  async analyze(conversationHistory) {
    // Filter out delivered reminders
    const remainingReminders = this.pendingReminders.filter(
      r => !this.deliveredReminderIds.has(r.id)
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
${remainingReminders.map(r => `- [${r.id}] ${r.title}: ${r.description || 'No details'}`).join('\n') || 'None'}

CALL DURATION: ${Math.round(callDurationMinutes)} minutes
MAX RECOMMENDED DURATION: ${this.maxCallDuration} minutes
${approachingEndTime ? 'NOTE: Call is approaching recommended end time.' : ''}

Respond ONLY with valid JSON matching this schema:
{
  "engagement_level": "high" | "medium" | "low",
  "emotional_state": "brief description",
  "should_deliver_reminder": boolean,
  "reminder_to_deliver": "reminder id if applicable",
  "suggested_topic": "topic suggestion if conversation stalls",
  "should_end_call": boolean,
  "end_call_reason": "reason if should end",
  "concerns": ["list of concerns for caregiver"]
}`;

    const conversationText = conversationHistory
      .map(turn => `${turn.role === 'assistant' ? 'DONNA' : 'SENIOR'}: ${turn.content}`)
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

      // Parse JSON response (handle markdown code blocks)
      let jsonText = responseText;
      if (responseText.includes('```')) {
        jsonText = responseText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      }

      const signal = JSON.parse(jsonText);

      // Force end call if way over time
      if (callDurationMinutes > this.maxCallDuration * 1.2) {
        signal.should_end_call = true;
        signal.end_call_reason = 'Call duration exceeded recommended time';
      }

      return signal;
    } catch (error) {
      console.error('[ObserverAgent] Analysis error:', error.message);

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

  /**
   * Mark a reminder as delivered
   */
  markReminderDelivered(reminderId) {
    this.deliveredReminderIds.add(reminderId);
  }

  /**
   * Update pending reminders
   */
  updateReminders(reminders) {
    this.pendingReminders = reminders;
  }

  /**
   * Get call duration in minutes
   */
  getCallDuration() {
    return (Date.now() - this.callStartTime.getTime()) / 60000;
  }
}
