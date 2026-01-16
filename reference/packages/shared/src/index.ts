// Shared types for Donna

export interface Caregiver {
  id: string;
  email: string;
  name: string;
  phone?: string;
  createdAt: Date;
}

export interface Senior {
  id: string;
  caregiverId: string;
  name: string;
  phone: string;
  dateOfBirth?: Date;
  timezone: string;
  locationCity?: string;
  locationState?: string;
  interests: string[];
  familyInfo?: Record<string, any>;
  medicalNotes?: string;
  preferredCallTimes?: Record<string, any>;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reminder {
  id: string;
  seniorId: string;
  type: 'medication' | 'appointment' | 'custom';
  title: string;
  description?: string;
  scheduleCron?: string;
  scheduledTime?: Date;
  isRecurring: boolean;
  isActive: boolean;
  lastDeliveredAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  seniorId: string;
  callSid?: string;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds?: number;
  status: 'in_progress' | 'completed' | 'no_answer' | 'failed';
  initiatedBy: 'scheduled' | 'manual' | 'senior_callback';
  audioUrl?: string;
  summary?: string;
  sentiment?: string;
  concerns?: string[];
  remindersDelivered?: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface ConversationTurn {
  id: string;
  conversationId: string;
  speaker: 'donna' | 'senior';
  content: string;
  audioSegmentUrl?: string;
  timestampOffsetMs?: number;
  observerSignals?: ObserverSignal;
  createdAt: Date;
}

export interface ObserverSignal {
  engagementLevel: 'high' | 'medium' | 'low';
  emotionalState: string;
  shouldDeliverReminder: boolean;
  reminderToDeliver?: string;
  suggestedTransition?: string;
  shouldEndCall: boolean;
  endCallReason?: string;
  concerns: string[];
}

export interface ScheduledCall {
  id: string;
  seniorId: string;
  type: 'check_in' | 'reminder' | 'custom';
  scheduledTime: Date;
  reminderIds?: string[];
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  retryCount: number;
  maxRetries: number;
  conversationId?: string;
  createdAt: Date;
  updatedAt: Date;
}
