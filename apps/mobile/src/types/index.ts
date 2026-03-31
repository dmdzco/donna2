export interface Senior {
  id: string;
  name: string;
  phone: string;
  timezone?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  interests?: string[];
  additionalInfo?: string;
  familyInfo?: Record<string, string>;
  preferredCallTimes?: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  seniorId: string;
  type: "medication" | "custom";
  title: string;
  description?: string;
  scheduledTime?: string;
  isRecurring: boolean;
  cronExpression?: string;
  isActive: boolean;
  lastDeliveredAt?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  seniorId: string;
  callSid: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  status: string;
  summary?: string;
  sentiment?: string;
  concerns?: string[];
}

export interface CallAnalysis {
  id: string;
  conversationId: string;
  seniorId: string;
  summary?: string;
  topics?: string[];
  engagementScore?: number;
  concerns?: string[];
  positiveObservations?: string[];
  followUpSuggestions?: string[];
  callQuality?: string;
}

export interface NotificationPreferences {
  callSummaries: boolean;
  missedCallAlerts: boolean;
  completedCallAlerts: boolean;
  pauseCalls: boolean;
}

export interface OnboardingInput {
  senior: {
    name: string;
    phone: string;
    timezone?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  relation: string;
  interests: string[];
  familyInfo?: { interestDetails?: Record<string, string> };
  additionalInfo?: string;
  reminders: string[];
  updateTopics?: string[];
  callSchedule?: { time?: string };
}

export interface CaregiverProfile {
  clerkUserId: string;
  seniors: Senior[];
}
