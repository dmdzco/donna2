import type {
  CaregiverProfile,
  Senior,
  Reminder,
  Conversation,
  NotificationPreferences,
  OnboardingInput,
} from "@/src/types";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://donna-api-production-2450.up.railway.app";

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
    const error = new ApiError(
      body.error ?? body.message ?? `HTTP ${res.status}`,
      res.status,
      body,
    );
    throw error;
  }

  return res.json();
}

/** Typed API error with status code and response body */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized() {
    return this.status === 401;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get needsOnboarding() {
    return this.status === 404 && this.body?.needsOnboarding === true;
  }
}

/** A single notification record from the backend */
export interface DonnaNotification {
  id: string;
  caregiverId: string;
  seniorId?: string;
  eventType: string;
  channel: string;
  content: string;
  metadata?: Record<string, unknown>;
  sentAt: string;
  readAt?: string | null;
}

export const api = {
  caregivers: {
    /** GET /api/caregivers/me -- returns current user's profile + linked seniors */
    me: (token: string) => fetchJson<CaregiverProfile>("/api/caregivers/me", { token }),
  },

  onboarding: {
    /** POST /api/onboarding -- creates senior + links to Clerk user + creates reminders */
    complete: (data: OnboardingInput, token: string) =>
      fetchJson<{ senior: Senior; reminders: Reminder[] }>("/api/onboarding", {
        method: "POST",
        body: JSON.stringify(data),
        token,
      }),
  },

  seniors: {
    /** GET /api/seniors/:id */
    get: (id: string, token: string) => fetchJson<Senior>(`/api/seniors/${id}`, { token }),

    /** PATCH /api/seniors/:id */
    update: (id: string, data: Partial<Senior>, token: string) =>
      fetchJson<Senior>(`/api/seniors/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        token,
      }),

    /** GET /api/seniors/:id/schedule */
    getSchedule: (id: string, token: string) =>
      fetchJson<{ schedule: unknown; updateTopics: string[] }>(
        `/api/seniors/${id}/schedule`,
        { token },
      ),

    /** PATCH /api/seniors/:id/schedule */
    updateSchedule: (
      id: string,
      data: { schedule?: unknown; updateTopics?: string[] },
      token: string,
    ) =>
      fetchJson<{ schedule: unknown; updateTopics: string[] }>(
        `/api/seniors/${id}/schedule`,
        { method: "PATCH", body: JSON.stringify(data), token },
      ),
  },

  reminders: {
    /**
     * GET /api/reminders -- lists all reminders the current user can access.
     * Backend filters by caregiver's assigned seniors automatically.
     */
    list: (token: string) => fetchJson<Reminder[]>("/api/reminders", { token }),

    /**
     * POST /api/reminders -- create a reminder.
     * The backend expects `seniorId` inside the body (not in the URL).
     */
    create: (
      data: { seniorId: string } & Omit<Partial<Reminder>, "id" | "createdAt" | "lastDeliveredAt">,
      token: string,
    ) =>
      fetchJson<Reminder>("/api/reminders", {
        method: "POST",
        body: JSON.stringify(data),
        token,
      }),

    /** PATCH /api/reminders/:id */
    update: (id: string, data: Partial<Reminder>, token: string) =>
      fetchJson<Reminder>(`/api/reminders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        token,
      }),

    /** DELETE /api/reminders/:id */
    delete: (id: string, token: string) =>
      fetchJson<{ success: boolean }>(`/api/reminders/${id}`, { method: "DELETE", token }),
  },

  conversations: {
    /** GET /api/conversations -- lists all recent conversations (filtered by access) */
    list: (token: string) => fetchJson<Conversation[]>("/api/conversations", { token }),

    /** GET /api/seniors/:id/conversations -- conversations for a specific senior */
    listForSenior: (seniorId: string, token: string) =>
      fetchJson<Conversation[]>(`/api/seniors/${seniorId}/conversations`, { token }),
  },

  calls: {
    /** POST /api/call -- initiate an outbound call to a phone number */
    initiate: (phoneNumber: string, token: string) =>
      fetchJson<{ success: boolean; callSid: string }>("/api/call", {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
        token,
      }),
  },

  notifications: {
    /** GET /api/notifications/preferences */
    getPreferences: (token: string) =>
      fetchJson<NotificationPreferences>("/api/notifications/preferences", { token }),

    /** PATCH /api/notifications/preferences */
    updatePreferences: (prefs: Partial<NotificationPreferences>, token: string) =>
      fetchJson<NotificationPreferences>("/api/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify(prefs),
        token,
      }),

    /** GET /api/notifications?page=N -- paginated notification history (20 per page) */
    list: (page: number, token: string) =>
      fetchJson<DonnaNotification[]>(`/api/notifications?page=${page}`, { token }),

    /** PATCH /api/notifications/:id/read -- mark a notification as read */
    markRead: (id: string, token: string) =>
      fetchJson<DonnaNotification>(`/api/notifications/${id}/read`, { method: "PATCH", token }),
  },
};
