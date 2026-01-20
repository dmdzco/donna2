/**
 * Observer Agent Module
 *
 * Monitors conversations in real-time to:
 * - Assess senior engagement and emotional state
 * - Determine optimal timing for reminder delivery
 * - Suggest conversation transitions
 * - Identify when to end calls gracefully
 * - Flag concerns for caregivers
 *
 * This module uses Claude to analyze conversation dynamics
 * and provide intelligent guidance signals.
 */

import type {
  IObserverAgent,
  IAnthropicAdapter,
  ObserverAnalysisRequest,
  ObserverSignal,
} from '@donna/shared/interfaces';
import { loggers, withContext } from '@donna/logger';
import { eventBus, createObserverSignalEvent, createErrorOccurredEvent } from '@donna/event-bus';

/**
 * ObserverAgentService
 *
 * Stateless service that analyzes conversation state
 * and returns guidance signals for call orchestration.
 */
export class ObserverAgentService implements IObserverAgent {
  private readonly DEFAULT_MAX_DURATION = 15; // minutes
  private readonly MAX_DURATION_MULTIPLIER = 1.2;
  private readonly APPROACHING_END_THRESHOLD = 0.8;

  constructor(private anthropicAdapter: IAnthropicAdapter) {}

  /**
   * Analyze conversation state and return guidance signals
   *
   * @param request - Analysis request with conversation history
   * @param context - Optional observability context for logging/events
   */
  async analyze(
    request: ObserverAnalysisRequest,
    context?: { callId?: string; conversationId?: string }
  ): Promise<ObserverSignal> {
    const {
      senior,
      conversationHistory,
      pendingReminders,
      currentTopic,
      callDuration = 0,
    } = request;

    const turnIndex = conversationHistory.length;
    const log = withContext({
      service: 'observer-agent',
      callId: context?.callId,
      conversationId: context?.conversationId,
      seniorId: senior.id,
    });

    log.debug({ turnIndex, callDuration }, 'Starting conversation analysis');

    // Calculate time-based signals
    const maxDuration = this.DEFAULT_MAX_DURATION;
    const callDurationMinutes = callDuration / 60; // convert seconds to minutes
    const approachingEndTime = callDurationMinutes > maxDuration * this.APPROACHING_END_THRESHOLD;
    const exceedsMaxTime = callDurationMinutes > maxDuration * this.MAX_DURATION_MULTIPLIER;

    // Build analysis prompt
    const systemPrompt = this.buildSystemPrompt(
      senior.name,
      pendingReminders,
      callDurationMinutes,
      maxDuration,
      approachingEndTime,
      currentTopic
    );

    const conversationText = conversationHistory
      .map(turn => `${turn.speaker.toUpperCase()}: ${turn.content}`)
      .join('\n');

    try {
      // Use Anthropic adapter to analyze conversation
      const response = await this.anthropicAdapter.chat(
        [
          {
            role: 'user',
            content: `Analyze this conversation:\n\n${conversationText}`,
          },
        ],
        systemPrompt,
        {
          maxTokens: 500,
        }
      );

      // Parse JSON response
      const rawSignal = JSON.parse(response);

      // Map to interface-compliant signal
      const signal: ObserverSignal = {
        engagementLevel: rawSignal.engagement_level || 'medium',
        emotionalState: this.mapEmotionalState(rawSignal.emotional_state),
        shouldDeliverReminder: rawSignal.should_deliver_reminder || false,
        reminderToDeliver: rawSignal.reminder_to_deliver,
        suggestedTransition: rawSignal.suggested_transition,
        shouldEndCall: rawSignal.should_end_call || false,
        endCallReason: rawSignal.end_call_reason,
        concerns: rawSignal.concerns || [],
        confidenceScore: this.calculateConfidenceScore(conversationHistory.length),
        timestamp: new Date(),
      };

      // Override: Force end call if way over time
      if (exceedsMaxTime) {
        signal.shouldEndCall = true;
        signal.endCallReason = 'Call duration exceeded recommended time';
      }

      // Log the analysis result
      log.info({
        engagement: signal.engagementLevel,
        emotion: signal.emotionalState,
        confidence: signal.confidenceScore,
        shouldEndCall: signal.shouldEndCall,
        concernsCount: signal.concerns.length,
        shouldDeliverReminder: signal.shouldDeliverReminder,
      }, 'Observer analysis completed');

      // Emit observability event
      if (context?.callId && context?.conversationId) {
        eventBus.emit(createObserverSignalEvent({
          callId: context.callId,
          conversationId: context.conversationId,
          seniorId: senior.id,
          signal,
          turnIndex,
        }));
      }

      return signal;
    } catch (error) {
      const err = error as Error;
      log.error({ error: err.message, stack: err.stack }, 'Observer agent analysis failed');

      // Emit error event
      if (context?.callId) {
        eventBus.emit(createErrorOccurredEvent({
          callId: context.callId,
          conversationId: context.conversationId,
          seniorId: senior.id,
          service: 'observer-agent',
          errorCode: 'ANALYSIS_FAILED',
          errorMessage: err.message,
          stack: err.stack,
        }));
      }

      // Return safe defaults on error
      return this.getDefaultSignal(approachingEndTime);
    }
  }

  /**
   * Build the system prompt for Claude
   */
  private buildSystemPrompt(
    seniorName: string,
    pendingReminders: any[],
    callDurationMinutes: number,
    maxDuration: number,
    approachingEndTime: boolean,
    currentTopic?: string
  ): string {
    const remindersList = pendingReminders.length > 0
      ? pendingReminders.map(r => `- ${r.title}: ${r.description || 'No details'}`).join('\n')
      : 'None';

    return `You are an observer monitoring a phone conversation between Donna (an AI companion) and ${seniorName} (an elderly person).

Your job is to analyze the conversation and provide guidance signals. You are NOT part of the conversation - you only observe and advise.

ANALYZE FOR:
1. Engagement level - Is the senior actively participating?
2. Emotional state - Are they happy, confused, tired, distressed?
3. Reminder opportunities - Good moments to naturally mention pending reminders
4. Topic suggestions - If conversation stalls, suggest transitions
5. End call signals - Signs they want to end, or natural endpoints
6. Concerns - Anything the caregiver should know about

PENDING REMINDERS (not yet delivered):
${remindersList}

CURRENT TOPIC: ${currentTopic || 'Not specified'}

CALL DURATION: ${Math.round(callDurationMinutes)} minutes
MAX RECOMMENDED DURATION: ${maxDuration} minutes
${approachingEndTime ? 'NOTE: Call is approaching recommended end time.' : ''}

Respond ONLY with valid JSON matching this schema:
{
  "engagement_level": "high" | "medium" | "low",
  "emotional_state": "brief description (e.g., happy, confused, tired, distressed, neutral)",
  "should_deliver_reminder": boolean,
  "reminder_to_deliver": "reminder title if applicable",
  "suggested_transition": "topic suggestion if needed",
  "should_end_call": boolean,
  "end_call_reason": "reason if should end",
  "concerns": ["list of concerns for caregiver"]
}`;
  }

  /**
   * Map free-form emotional state to standard categories
   */
  private mapEmotionalState(state: string): ObserverSignal['emotionalState'] {
    if (!state) return 'neutral';

    const lowerState = state.toLowerCase();

    if (lowerState.includes('happy') || lowerState.includes('joyful') || lowerState.includes('cheerful')) {
      return 'positive';
    }
    if (lowerState.includes('confused') || lowerState.includes('uncertain')) {
      return 'confused';
    }
    if (lowerState.includes('distress') || lowerState.includes('upset') || lowerState.includes('anxious')) {
      return 'distressed';
    }
    if (lowerState.includes('sad') || lowerState.includes('tired') || lowerState.includes('negative')) {
      return 'negative';
    }

    return 'neutral';
  }

  /**
   * Calculate confidence score based on conversation length
   * More conversation history = higher confidence in analysis
   */
  private calculateConfidenceScore(turnCount: number): number {
    if (turnCount < 2) return 0.3;
    if (turnCount < 4) return 0.5;
    if (turnCount < 8) return 0.7;
    if (turnCount < 12) return 0.85;
    return 0.95;
  }

  /**
   * Return default signal when analysis fails
   */
  private getDefaultSignal(approachingEndTime: boolean): ObserverSignal {
    return {
      engagementLevel: 'medium',
      emotionalState: 'neutral',
      shouldDeliverReminder: false,
      shouldEndCall: approachingEndTime,
      endCallReason: approachingEndTime ? 'Approaching time limit' : undefined,
      concerns: [],
      confidenceScore: 0.3,
      timestamp: new Date(),
    };
  }
}
