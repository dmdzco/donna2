const API_URL = import.meta.env.VITE_API_URL || '';

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || error.error || 'Request failed');
  }

  return res.json();
}

export const api = {
  // Caregiver endpoints
  caregivers: {
    me: () => fetchJson<{ clerkUserId: string; seniors: any[] }>('/api/caregivers/me'),
  },

  // Onboarding
  onboarding: {
    complete: (data: OnboardingInput) =>
      fetchJson<{ senior: any; reminders: any[] }>('/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // Seniors
  seniors: {
    get: (id: string) => fetchJson<any>(`/api/seniors/${id}`),
    update: (id: string, data: any) =>
      fetchJson<any>(`/api/seniors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  // Reminders
  reminders: {
    list: (seniorId: string) => fetchJson<any[]>(`/api/seniors/${seniorId}/reminders`),
    create: (seniorId: string, data: any) =>
      fetchJson<any>(`/api/seniors/${seniorId}/reminders`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      fetchJson<any>(`/api/reminders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchJson<any>(`/api/reminders/${id}`, {
        method: 'DELETE',
      }),
  },

  // Calls
  calls: {
    initiate: (phoneNumber: string) =>
      fetchJson<any>(`/api/call`, {
        method: 'POST',
        body: JSON.stringify({ phoneNumber }),
      }),
  },
};

// Types
export interface OnboardingInput {
  senior: {
    name: string;
    phone: string;
    city?: string;
    state?: string;
    zipCode?: string;
    timezone?: string;
  };
  relation: string;
  interests: string[];
  additionalInfo?: string;
  reminders: string[];
  updateTopics: string[];
  callSchedule: {
    days: string[];
    time: string;
  };
}
