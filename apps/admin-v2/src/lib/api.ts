const API_URL = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'donna_admin_token';

export async function authFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(options.headers || {})),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  return res;
}

export async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await authFetch(endpoint, options);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || error.error || 'Request failed');
  }
  return res.json();
}

// ===== API Methods =====

export const api = {
  // Auth
  auth: {
    login: (email: string, password: string) =>
      fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }).then((r) => r.json()),
    me: (token: string) =>
      fetch(`${API_URL}/api/admin/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
  },

  // Dashboard
  stats: {
    get: () => fetchJson<DashboardStats>('/api/stats'),
  },

  // Seniors
  seniors: {
    list: () => fetchJson<Senior[]>('/api/seniors'),
    get: (id: string) => fetchJson<Senior>(`/api/seniors/${id}`),
    create: (data: CreateSeniorInput) =>
      authFetch('/api/seniors', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Senior>) =>
      authFetch(`/api/seniors/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      authFetch(`/api/seniors/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) }),
    getMemories: (id: string) => fetchJson<Memory[]>(`/api/seniors/${id}/memories`),
    addMemory: (id: string, data: { type: string; content: string; importance: number }) =>
      authFetch(`/api/seniors/${id}/memories`, { method: 'POST', body: JSON.stringify(data) }),
  },

  // Calls
  calls: {
    list: () => fetchJson<Call[]>('/api/conversations'),
    initiate: (phoneNumber: string) =>
      authFetch('/api/call', { method: 'POST', body: JSON.stringify({ phoneNumber }) }),
  },

  // Reminders
  reminders: {
    list: () => fetchJson<Reminder[]>('/api/reminders'),
    create: (data: CreateReminderInput) =>
      authFetch('/api/reminders', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => authFetch(`/api/reminders/${id}`, { method: 'DELETE' }),
  },

  // Call Analyses
  callAnalyses: {
    list: () => fetchJson<CallAnalysis[]>('/api/call-analyses'),
  },

  // Caregivers
  caregivers: {
    list: () => fetchJson<CaregiverLink[]>('/api/caregivers'),
  },

  // Daily Context
  dailyContext: {
    list: (params?: { seniorId?: string; date?: string }) => {
      const search = new URLSearchParams();
      if (params?.seniorId) search.set('seniorId', params.seniorId);
      if (params?.date) search.set('date', params.date);
      const qs = search.toString();
      return fetchJson<DailyContextEntry[]>(`/api/daily-context${qs ? `?${qs}` : ''}`);
    },
  },
};

// ===== TypeScript Types =====

export interface DashboardStats {
  totalSeniors: number;
  callsToday: number;
  upcomingRemindersCount: number;
  activeCalls: number;
  recentCalls: RecentCall[];
  upcomingReminders: UpcomingReminder[];
}

export interface RecentCall {
  seniorName: string;
  startedAt: string;
  durationSeconds: number;
  status: string;
}

export interface UpcomingReminder {
  title: string;
  seniorName: string;
  type: string;
  scheduledTime: string;
}

export interface Senior {
  id: string;
  name: string;
  phone: string;
  interests: string[];
  familyInfo: { location?: string };
  medicalNotes: string;
  isActive: boolean;
  memories?: Memory[];
}

export interface CreateSeniorInput {
  name: string;
  phone: string;
  interests: string[];
  familyInfo: { location: string };
  medicalNotes: string;
}

export interface Memory {
  id: string;
  type: string;
  content: string;
}

export interface Call {
  id: string;
  seniorName: string;
  startedAt: string;
  durationSeconds: number;
  status: string;
  transcript: TranscriptMessage[];
}

export interface TranscriptMessage {
  role: 'assistant' | 'user';
  content: string;
}

export interface Reminder {
  id: string;
  seniorId: string;
  seniorName: string;
  type: string;
  title: string;
  description: string;
  scheduledTime: string;
  isRecurring: boolean;
  cronExpression: string | null;
  lastDeliveredAt: string | null;
}

export interface CreateReminderInput {
  seniorId: string;
  type: string;
  title: string;
  description: string;
  scheduledTime: string | null;
  isRecurring: boolean;
  cronExpression: string | null;
}

export interface CallAnalysis {
  id: string;
  seniorName: string;
  createdAt: string;
  engagementScore: number;
  summary: string;
  topics: string[];
  concerns: (string | { description: string })[];
  positiveObservations: string[];
  followUpSuggestions: string[];
}

export interface CaregiverLink {
  clerkUserId: string;
  seniorId: string;
  seniorName: string;
  role: string;
  createdAt: string;
}

export interface DailyContextEntry {
  seniorName: string;
  callDate: string;
  summary: string;
  topicsDiscussed: string[];
  remindersDelivered: string[];
  adviceGiven: string[];
}
