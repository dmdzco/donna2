import { getAdapter } from '../adapters/llm/index.js';

// Deep observer model (gemini-3-pro for thorough analysis)
const DEEP_OBSERVER_MODEL = process.env.DEEP_OBSERVER_MODEL || 'gemini-3-pro';

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
  "emotional_complexity": "simple" | "complex" (complex = multi-layered emotions needing nuance),
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
      const adapter = getAdapter(DEEP_OBSERVER_MODEL);
      const messages = [
        {
          role: 'user',
          content: `Analyze this conversation:\n\n${conversationText}`,
        },
      ];

      const responseText = await adapter.generate(systemPrompt, messages, {
        maxTokens: 500,
        temperature: 0.3,
      });

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

      // Build model recommendation based on deep analysis
      signal.modelRecommendation = this.buildModelRecommendation(signal);

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

  /**
   * Build model recommendation based on deep observer analysis
   * Returns upgrade to Sonnet + higher token count for complex situations
   */
  buildModelRecommendation(signal) {
    // Complex emotional patterns need sophisticated handling
    if (signal.emotional_complexity === 'complex') {
      return {
        use_sonnet: true,
        max_tokens: 180,
        reason: 'complex_emotional_pattern'
      };
    }

    // Should end call - needs graceful wrap-up
    if (signal.should_end_call) {
      return {
        use_sonnet: true,
        max_tokens: 150,
        reason: 'graceful_ending'
      };
    }

    // Reminder delivery - needs natural integration
    if (signal.should_deliver_reminder && signal.reminder_to_deliver) {
      return {
        use_sonnet: false, // Haiku can handle, just needs more tokens
        max_tokens: 120,
        reason: 'reminder_delivery'
      };
    }

    // Low engagement - may need creative response
    if (signal.engagement_level === 'low') {
      return {
        use_sonnet: true,
        max_tokens: 120,
        reason: 'low_engagement_recovery'
      };
    }

    // Has concerns - need thoughtful response
    if (signal.concerns?.length > 0) {
      return {
        use_sonnet: true,
        max_tokens: 150,
        reason: 'caregiver_concerns'
      };
    }

    // Default - no recommendation
    return null;
  }
}
