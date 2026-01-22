// Donna Admin API Client
// All API calls are typed and centralized here

const BASE = import.meta.env.VITE_API_URL || '';

// Types
export interface Senior {
  id: string;
  name: string;
  phone: string;
  timezone?: string;
  interests: string[];
  familyInfo?: {
    location?: string;
    [key: string]: unknown;
  };
  medicalNotes?: string;
  preferredCallTimes?: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  memories?: Memory[];
}

export interface Memory {
  id: string;
  seniorId: string;
  type: 'fact' | 'preference' | 'event' | 'concern' | 'relationship';
  content: string;
  importance: number;
  createdAt: string;
  lastAccessedAt?: string;
}

export interface Conversation {
  id: string;
  seniorId: string;
  seniorName?: string;
  callSid: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  status: 'completed' | 'failed' | 'in-progress' | 'no-answer';
  summary?: string;
  sentiment?: string;
  concerns?: string[];
  transcript?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface Reminder {
  id: string;
  seniorId: string;
  seniorName?: string;
  type: 'medication' | 'appointment' | 'custom';
  title: string;
  description?: string;
  scheduledTime?: string;
  isRecurring: boolean;
  cronExpression?: string;
  isActive: boolean;
  lastDeliveredAt?: string;
  createdAt: string;
}

export interface DashboardStats {
  totalSeniors: number;
  callsToday: number;
  upcomingRemindersCount: number;
  activeCalls: number;
  recentCalls: Conversation[];
  upcomingReminders: Reminder[];
}

export interface CreateSeniorInput {
  name: string;
  phone: string;
  interests?: string[];
  familyInfo?: { location?: string };
  medicalNotes?: string;
}

export interface CreateReminderInput {
  seniorId: string;
  type: 'medication' | 'appointment' | 'custom';
  title: string;
  description?: string;
  scheduledTime?: string;
  isRecurring: boolean;
  cronExpression?: string;
}

export interface CreateMemoryInput {
  type: Memory['type'];
  content: string;
  importance?: number;
}

// API Client
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Dashboard
  stats: {
    get: (): Promise<DashboardStats> => fetchJson('/api/stats'),
  },

  // Seniors
  seniors: {
    list: (): Promise<Senior[]> => fetchJson('/api/seniors'),
    get: (id: string): Promise<Senior> => fetchJson(`/api/seniors/${id}`),
    create: (data: CreateSeniorInput): Promise<Senior> =>
      fetchJson('/api/seniors', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Senior>): Promise<Senior> =>
      fetchJson(`/api/seniors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string): Promise<void> =>
      fetchJson(`/api/seniors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      }),
  },

  // Memories
  memories: {
    list: (seniorId: string): Promise<Memory[]> =>
      fetchJson(`/api/seniors/${seniorId}/memories`),
    create: (seniorId: string, data: CreateMemoryInput): Promise<Memory> =>
      fetchJson(`/api/seniors/${seniorId}/memories`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // Calls
  calls: {
    list: (): Promise<Conversation[]> => fetchJson('/api/conversations'),
    initiate: (phoneNumber: string): Promise<{ callSid: string }> =>
      fetchJson('/api/call', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber }),
      }),
    end: (callSid: string): Promise<void> =>
      fetchJson(`/api/calls/${callSid}/end`, { method: 'POST' }),
  },

  // Reminders
  reminders: {
    list: (): Promise<Reminder[]> => fetchJson('/api/reminders'),
    create: (data: CreateReminderInput): Promise<Reminder> =>
      fetchJson('/api/reminders', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (id: string): Promise<void> =>
      fetchJson(`/api/reminders/${id}`, { method: 'DELETE' }),
  },
};

// Utility functions
export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
