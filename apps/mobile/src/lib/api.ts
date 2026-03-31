const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://donna-api-production-2450.up.railway.app";

type FetchOptions = RequestInit & { token?: string };

async function fetchJson<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { token, ...fetchOpts } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((fetchOpts.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(`${API_URL}${endpoint}`, { ...fetchOpts, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  caregivers: {
    me: (token: string) =>
      fetchJson<{ clerkUserId: string; seniors: any[] }>("/api/caregivers/me", { token }),
  },
  onboarding: {
    complete: (data: any, token: string) =>
      fetchJson("/api/onboarding", { method: "POST", body: JSON.stringify(data), token }),
  },
  seniors: {
    get: (id: string, token: string) =>
      fetchJson<any>(`/api/seniors/${id}`, { token }),
    update: (id: string, data: any, token: string) =>
      fetchJson(`/api/seniors/${id}`, { method: "PATCH", body: JSON.stringify(data), token }),
    getSchedule: (id: string, token: string) =>
      fetchJson<any>(`/api/seniors/${id}/schedule`, { token }),
    updateSchedule: (id: string, data: any, token: string) =>
      fetchJson(`/api/seniors/${id}/schedule`, { method: "PATCH", body: JSON.stringify(data), token }),
  },
  reminders: {
    list: (seniorId: string, token: string) =>
      fetchJson<any[]>(`/api/seniors/${seniorId}/reminders`, { token }),
    create: (seniorId: string, data: any, token: string) =>
      fetchJson(`/api/seniors/${seniorId}/reminders`, { method: "POST", body: JSON.stringify(data), token }),
    update: (id: string, data: any, token: string) =>
      fetchJson(`/api/reminders/${id}`, { method: "PATCH", body: JSON.stringify(data), token }),
    delete: (id: string, token: string) =>
      fetchJson(`/api/reminders/${id}`, { method: "DELETE", token }),
  },
  conversations: {
    list: (token: string) =>
      fetchJson<any[]>("/api/conversations", { token }),
    listForSenior: (seniorId: string, token: string) =>
      fetchJson<any[]>(`/api/seniors/${seniorId}/conversations`, { token }),
  },
  calls: {
    initiate: (phoneNumber: string, token: string) =>
      fetchJson<{ success: boolean; callSid: string }>("/api/call", { method: "POST", body: JSON.stringify({ phoneNumber }), token }),
  },
  notifications: {
    getPreferences: (token: string) =>
      fetchJson<any>("/api/notifications/preferences", { token }),
    updatePreferences: (prefs: any, token: string) =>
      fetchJson("/api/notifications/preferences", { method: "PATCH", body: JSON.stringify(prefs), token }),
    list: (page: number, token: string) =>
      fetchJson<any[]>(`/api/notifications?page=${page}`, { token }),
    markRead: (id: string, token: string) =>
      fetchJson(`/api/notifications/${id}/read`, { method: "PATCH", token }),
  },
};
