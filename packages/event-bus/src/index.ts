import { EventEmitter } from 'events';
import type { ObserverSignal } from '@donna/shared/interfaces';

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Call lifecycle events
 */
export interface CallInitiatedEvent {
  type: 'call.initiated';
  callId: string;
  callSid: string;
  seniorId: string;
  initiatedBy: 'scheduled' | 'manual';
  timestamp: Date;
}

export interface CallConnectedEvent {
  type: 'call.connected';
  callId: string;
  callSid: string;
  seniorId: string;
  timestamp: Date;
}

export interface CallEndedEvent {
  type: 'call.ended';
  callId: string;
  callSid: string;
  seniorId: string;
  durationSeconds: number;
  reason: 'completed' | 'no_answer' | 'busy' | 'failed' | 'cancelled';
  timestamp: Date;
}

/**
 * Conversation turn events
 */
export interface TurnTranscribedEvent {
  type: 'turn.transcribed';
  callId: string;
  conversationId: string;
  seniorId: string;
  speaker: 'senior';
  content: string;
  confidence?: number;
  timestamp: Date;
}

export interface TurnResponseEvent {
  type: 'turn.response';
  callId: string;
  conversationId: string;
  seniorId: string;
  speaker: 'donna';
  content: string;
  timestamp: Date;
}

/**
 * Observer agent events
 */
export interface ObserverSignalEvent {
  type: 'observer.signal';
  callId: string;
  conversationId: string;
  seniorId: string;
  signal: ObserverSignal;
  turnIndex: number;
  timestamp: Date;
}

/**
 * Reminder events
 */
export interface ReminderDeliveredEvent {
  type: 'reminder.delivered';
  callId: string;
  conversationId: string;
  seniorId: string;
  reminderId: string;
  reminderTitle: string;
  acknowledged: boolean;
  timestamp: Date;
}

/**
 * Error events
 */
export interface ErrorOccurredEvent {
  type: 'error.occurred';
  callId?: string;
  conversationId?: string;
  seniorId?: string;
  service: string;
  errorCode: string;
  errorMessage: string;
  stack?: string;
  timestamp: Date;
}

/**
 * Union of all observability events
 */
export type ObservabilityEvent =
  | CallInitiatedEvent
  | CallConnectedEvent
  | CallEndedEvent
  | TurnTranscribedEvent
  | TurnResponseEvent
  | ObserverSignalEvent
  | ReminderDeliveredEvent
  | ErrorOccurredEvent;

export type ObservabilityEventType = ObservabilityEvent['type'];

// ============================================================================
// EVENT BUS
// ============================================================================

type EventHandler<T> = (event: T) => void | Promise<void>;

/**
 * Type-safe event bus for observability events
 */
class ObservabilityEventBus {
  private emitter = new EventEmitter();
  private handlers: Map<string, Set<EventHandler<any>>> = new Map();

  constructor() {
    // Increase max listeners for high-throughput scenarios
    this.emitter.setMaxListeners(100);
  }

  /**
   * Emit an observability event
   */
  emit<T extends ObservabilityEvent>(event: T): void {
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event); // Wildcard for catching all events
  }

  /**
   * Subscribe to a specific event type
   */
  on<T extends ObservabilityEventType>(
    eventType: T,
    handler: EventHandler<Extract<ObservabilityEvent, { type: T }>>
  ): () => void {
    this.emitter.on(eventType, handler);

    // Track handler for cleanup
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.emitter.off(eventType, handler);
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Subscribe to all events
   */
  onAll(handler: EventHandler<ObservabilityEvent>): () => void {
    this.emitter.on('*', handler);
    return () => this.emitter.off('*', handler);
  }

  /**
   * Subscribe to an event type once
   */
  once<T extends ObservabilityEventType>(
    eventType: T,
    handler: EventHandler<Extract<ObservabilityEvent, { type: T }>>
  ): void {
    this.emitter.once(eventType, handler);
  }

  /**
   * Remove all listeners for an event type
   */
  removeAllListeners(eventType?: ObservabilityEventType): void {
    if (eventType) {
      this.emitter.removeAllListeners(eventType);
      this.handlers.delete(eventType);
    } else {
      this.emitter.removeAllListeners();
      this.handlers.clear();
    }
  }

  /**
   * Get count of listeners for an event type
   */
  listenerCount(eventType: ObservabilityEventType): number {
    return this.emitter.listenerCount(eventType);
  }
}

// Singleton instance
export const eventBus = new ObservabilityEventBus();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a call.initiated event
 */
export function createCallInitiatedEvent(
  data: Omit<CallInitiatedEvent, 'type' | 'timestamp'>
): CallInitiatedEvent {
  return { type: 'call.initiated', ...data, timestamp: new Date() };
}

/**
 * Create a call.connected event
 */
export function createCallConnectedEvent(
  data: Omit<CallConnectedEvent, 'type' | 'timestamp'>
): CallConnectedEvent {
  return { type: 'call.connected', ...data, timestamp: new Date() };
}

/**
 * Create a call.ended event
 */
export function createCallEndedEvent(
  data: Omit<CallEndedEvent, 'type' | 'timestamp'>
): CallEndedEvent {
  return { type: 'call.ended', ...data, timestamp: new Date() };
}

/**
 * Create a turn.transcribed event
 */
export function createTurnTranscribedEvent(
  data: Omit<TurnTranscribedEvent, 'type' | 'timestamp' | 'speaker'>
): TurnTranscribedEvent {
  return { type: 'turn.transcribed', speaker: 'senior', ...data, timestamp: new Date() };
}

/**
 * Create a turn.response event
 */
export function createTurnResponseEvent(
  data: Omit<TurnResponseEvent, 'type' | 'timestamp' | 'speaker'>
): TurnResponseEvent {
  return { type: 'turn.response', speaker: 'donna', ...data, timestamp: new Date() };
}

/**
 * Create an observer.signal event
 */
export function createObserverSignalEvent(
  data: Omit<ObserverSignalEvent, 'type' | 'timestamp'>
): ObserverSignalEvent {
  return { type: 'observer.signal', ...data, timestamp: new Date() };
}

/**
 * Create a reminder.delivered event
 */
export function createReminderDeliveredEvent(
  data: Omit<ReminderDeliveredEvent, 'type' | 'timestamp'>
): ReminderDeliveredEvent {
  return { type: 'reminder.delivered', ...data, timestamp: new Date() };
}

/**
 * Create an error.occurred event
 */
export function createErrorOccurredEvent(
  data: Omit<ErrorOccurredEvent, 'type' | 'timestamp'>
): ErrorOccurredEvent {
  return { type: 'error.occurred', ...data, timestamp: new Date() };
}
