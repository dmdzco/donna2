import pino, { Logger, LoggerOptions } from 'pino';

/**
 * Context for correlation across requests/calls
 */
export interface LogContext {
  /** Unique ID for the phone call */
  callId?: string;
  /** Conversation record ID */
  conversationId?: string;
  /** Senior being called */
  seniorId?: string;
  /** Caregiver who initiated */
  caregiverId?: string;
  /** Service/module name */
  service?: string;
  /** Distributed trace ID */
  traceId?: string;
  /** Request ID for HTTP requests */
  requestId?: string;
}

/**
 * Event types for observability
 */
export type ObservabilityEventType =
  | 'call.initiated'
  | 'call.connected'
  | 'call.ended'
  | 'call.failed'
  | 'turn.transcribed'
  | 'turn.response'
  | 'observer.signal'
  | 'reminder.delivered'
  | 'error.occurred';

/**
 * Structured log entry for observability events
 */
export interface ObservabilityLogEntry {
  eventType: ObservabilityEventType;
  context: LogContext;
  data?: Record<string, unknown>;
  timestamp?: Date;
}

// Base logger configuration
const baseConfig: LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Pretty print in development
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
};

// Create the base logger
const baseLogger = pino(baseConfig);

/**
 * Create a logger for a specific service/module
 */
export function createLogger(service: string): Logger {
  return baseLogger.child({ service });
}

/**
 * Create a logger with additional context (call, conversation, etc.)
 */
export function withContext(ctx: LogContext): Logger {
  return baseLogger.child(ctx);
}

/**
 * Log an observability event with structured data
 */
export function logEvent(entry: ObservabilityLogEntry): void {
  const logger = withContext(entry.context);
  logger.info(
    {
      eventType: entry.eventType,
      eventData: entry.data,
      eventTimestamp: entry.timestamp?.toISOString() || new Date().toISOString(),
    },
    `[${entry.eventType}]`
  );
}

/**
 * Pre-configured loggers for each module
 */
export const loggers = {
  callOrchestrator: createLogger('call-orchestrator'),
  voicePipeline: createLogger('voice-pipeline'),
  observerAgent: createLogger('observer-agent'),
  conversationManager: createLogger('conversation-manager'),
  reminderManagement: createLogger('reminder-management'),
  schedulerService: createLogger('scheduler-service'),
  memoryContext: createLogger('memory-context'),
  analyticsEngine: createLogger('analytics-engine'),
  api: createLogger('api'),
  twilio: createLogger('twilio-adapter'),
  deepgram: createLogger('deepgram-adapter'),
  elevenlabs: createLogger('elevenlabs-adapter'),
  anthropic: createLogger('anthropic-adapter'),
  storage: createLogger('storage-adapter'),
};

// Export the base logger for direct use if needed
export { baseLogger as logger };
export type { Logger } from 'pino';
