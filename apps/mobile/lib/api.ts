import { useAuth } from '@clerk/clerk-expo';
import { getApiUrl } from '@/src/lib/runtimeConfig';

async function fetchWithAuth(path: string, options: RequestInit = {}, token?: string | null) {
  const apiUrl = getApiUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${apiUrl}${path}`, { ...options, headers });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || `HTTP ${res.status}`);
  }

  return res.json();
}

// --- Hook-based API client (use inside components) ---
export function useApi() {
  const { getToken } = useAuth();

  async function get(path: string) {
    const token = await getToken();
    return fetchWithAuth(path, { method: 'GET' }, token);
  }

  async function post(path: string, body: unknown) {
    const token = await getToken();
    return fetchWithAuth(path, { method: 'POST', body: JSON.stringify(body) }, token);
  }

  async function put(path: string, body: unknown) {
    const token = await getToken();
    return fetchWithAuth(path, { method: 'PUT', body: JSON.stringify(body) }, token);
  }

  async function del(path: string) {
    const token = await getToken();
    return fetchWithAuth(path, { method: 'DELETE' }, token);
  }

  return {
    // Onboarding
    submitOnboarding: (data: unknown) => post('/api/onboarding', data),

    // Seniors / Loved One
    getSeniors: () => get('/api/seniors'),
    updateSenior: (id: string, data: unknown) => put(`/api/seniors/${id}`, data),

    // Reminders
    getReminders: () => get('/api/reminders'),
    createReminder: (data: unknown) => post('/api/reminders', data),
    updateReminder: (id: string, data: unknown) => put(`/api/reminders/${id}`, data),
    deleteReminder: (id: string) => del(`/api/reminders/${id}`),

    // Conversations / Calls
    getConversations: () => get('/api/conversations'),
    getCalls: () => get('/api/calls'),
    initiateCall: (data: unknown) => post('/api/call', data),
  };
}
