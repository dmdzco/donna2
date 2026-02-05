export interface Call {
  id: string;
  senior_id: string;
  call_sid: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  status: 'in_progress' | 'completed' | 'no_answer' | 'failed';
  initiated_by: 'scheduled' | 'manual';
  summary?: string;
  sentiment?: string;
  concerns?: string[];
  senior_name?: string;
  senior_phone?: string;
  turn_count?: number;
  call_metrics?: CallMetrics | null;
}

export interface TimelineEvent {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface Timeline {
  callId: string;
  callSid: string;
  seniorId: string;
  startedAt: string;
  endedAt?: string;
  status: string;
  timeline: TimelineEvent[];
}

export interface Turn {
  id: string;
  speaker: 'donna' | 'senior';
  content: string;
  audio_segment_url?: string;
  timestamp_offset_ms?: number;
  observer_signals?: ObserverSignal;
  timestamp: string;
}

export interface ObserverSignal {
  engagementLevel: 'high' | 'medium' | 'low';
  emotionalState: 'positive' | 'neutral' | 'negative' | 'confused' | 'distressed';
  shouldDeliverReminder: boolean;
  reminderToDeliver?: string;
  suggestedTransition?: string;
  shouldEndCall: boolean;
  endCallReason?: string;
  concerns: string[];
  confidenceScore: number;
  timestamp: string;
}

export interface ObserverSummary {
  callId: string;
  signals: Array<{
    turnId: string;
    speaker: string;
    turnContent: string;
    timestamp: string;
    signal: ObserverSignal;
  }>;
  count: number;
  summary: {
    averageConfidence: number;
    engagementDistribution: Record<string, number>;
    emotionalStateDistribution: Record<string, number>;
    totalConcerns: number;
    uniqueConcerns: string[];
  };
}

export interface Continuity {
  seniorId: string;
  recentTurns: Array<Turn & { conversation_id: string; conversation_started_at: string }>;
  lastSeniorTurn?: Turn;
  lastCallDropped: boolean;
  lastInteractionAt?: string;
  turnCount: number;
}

export interface TurnMetric {
  turnIndex: number;
  role: string;
  model: string;
  maxTokens: number;
  inputTokens: number;
  outputTokens: number;
  ttfa?: number | null;
  responseTime: number;
  tokenReason: string;
}

export interface CallMetrics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  avgResponseTime: number;
  avgTtfa: number | null;
  turnCount: number;
  estimatedCost: number;
  modelsUsed: string[];
}

export interface MetricsData {
  turnMetrics: TurnMetric[];
  callMetrics: CallMetrics | null;
  durationSeconds: number | null;
}
