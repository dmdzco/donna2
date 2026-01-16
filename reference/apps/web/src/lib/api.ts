const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface Senior {
  id: string;
  name: string;
  phone: string;
  date_of_birth?: string;
  timezone: string;
  location_city?: string;
  location_state?: string;
  interests: string[];
  is_active: boolean;
  created_at: string;
}

export interface Reminder {
  id: string;
  senior_id: string;
  type: 'medication' | 'appointment' | 'custom';
  title: string;
  description?: string;
  is_recurring: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  senior_id: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  status: string;
  summary?: string;
  sentiment?: string;
  concerns?: string[];
}

export interface ConversationTurn {
  id: string;
  speaker: 'donna' | 'senior';
  content: string;
  timestamp_offset_ms?: number;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

export const api = {
  // Auth
  login(email: string, password: string) {
    return request<{ token: string; caregiver: any }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  register(data: { name: string; email: string; password: string; phone?: string }) {
    return request<{ token: string; caregiver: any }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getMe() {
    return request<{ caregiver: any }>('/api/auth/me');
  },

  // Seniors
  getSeniors() {
    return request<{ seniors: Senior[] }>('/api/seniors');
  },

  getSenior(id: string) {
    return request<{ senior: Senior }>(`/api/seniors/${id}`);
  },

  createSenior(data: {
    name: string;
    phone: string;
    dateOfBirth?: string;
    locationCity?: string;
    locationState?: string;
    interests?: string[];
  }) {
    return request<{ senior: Senior }>('/api/seniors', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateSenior(id: string, data: Partial<Senior>) {
    return request<{ senior: Senior }>(`/api/seniors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteSenior(id: string) {
    return request<{ success: boolean }>(`/api/seniors/${id}`, {
      method: 'DELETE',
    });
  },

  // Reminders
  getReminders(seniorId: string) {
    return request<{ reminders: Reminder[] }>(`/api/reminders/senior/${seniorId}`);
  },

  createReminder(data: {
    seniorId: string;
    type: 'medication' | 'appointment' | 'custom';
    title: string;
    description?: string;
    isRecurring?: boolean;
  }) {
    return request<{ reminder: Reminder }>('/api/reminders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteReminder(id: string) {
    return request<{ success: boolean }>(`/api/reminders/${id}`, {
      method: 'DELETE',
    });
  },

  // Conversations
  getConversations(seniorId: string) {
    return request<{ conversations: Conversation[]; total: number }>(
      `/api/conversations/senior/${seniorId}`
    );
  },

  getConversation(id: string) {
    return request<{ conversation: Conversation; turns: ConversationTurn[] }>(
      `/api/conversations/${id}`
    );
  },

  // Voice
  initiateCall(seniorId: string) {
    return request<{ success: boolean; callSid: string }>(`/api/voice/call/${seniorId}`, {
      method: 'POST',
    });
  },
};
