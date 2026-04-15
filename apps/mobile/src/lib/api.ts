import type {
  CaregiverProfile,
  Senior,
  Reminder,
  Conversation,
  NotificationPreferences,
  OnboardingInput,
} from "@/src/types";

function getRequiredApiUrl(): string {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!apiUrl) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is required for the mobile app. Set it in apps/mobile/.env or the EAS environment.",
    );
  }
  return apiUrl.replace(/\/+$/, "");
}

const API_URL = getRequiredApiUrl();

type WriteOptions = { idempotencyKey?: string };
type FetchOptions = RequestInit & { token?: string } & WriteOptions;

async function fetchJson<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { token, idempotencyKey, ...fetchOpts } = options;
  const requestId = createRequestId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Request-Id": requestId,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
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

  /** Human-readable message including status code for debugging */
  get displayMessage() {
    return `${this.message} (${this.status})`;
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

export interface AccountDeletionResult {
  success: boolean;
  clerkUserDeleted: boolean;
  deletedSeniors: string[];
  unlinkedSeniors: string[];
  deletionCounts: Record<string, Record<string, number>>;
  message?: string;
}

export function createIdempotencyKey(scope: string): string {
  return `${sanitizeKeyPart(scope)}:${createRequestId()}`.slice(0, 128);
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const random = Math.random().toString(36).slice(2, 12);
  return `${Date.now().toString(36)}-${random}`;
}

function sanitizeKeyPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 40) || "mobile";
}

/**
 * Extract a user-facing error message from a React Query error.
 * Shows the API error message + status code for debugging.
 * Falls back to a generic message for non-API errors.
 */
export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof ApiError) return error.displayMessage;
  if (error instanceof Error) return error.message;
  return fallback;
}

export const api = {
  caregivers: {
    /** GET /api/caregivers/me -- returns current user's profile + linked seniors */
    me: (token: string) => fetchJson<CaregiverProfile>("/api/caregivers/me", { token }),
  },

  account: {
    /** DELETE /api/caregivers/me/account -- deletes the current caregiver account */
    delete: (token: string, options?: WriteOptions) =>
      fetchJson<AccountDeletionResult>("/api/caregivers/me/account", {
        method: "DELETE",
        token,
        idempotencyKey: options?.idempotencyKey,
      }),
  },

  onboarding: {
    /** POST /api/onboarding -- creates senior + links to Clerk user + creates reminders */
    complete: (data: OnboardingInput, token: string, options?: WriteOptions) =>
      fetchJson<{ senior: Senior; reminders: Reminder[] }>("/api/onboarding", {
        method: "POST",
        body: JSON.stringify(data),
        token,
        idempotencyKey: options?.idempotencyKey,
      }),
  },

  seniors: {
    /** GET /api/seniors/:id */
    get: (id: string, token: string) => fetchJson<Senior>(`/api/seniors/${id}`, { token }),

    /** PATCH /api/seniors/:id */
    update: (id: string, data: Partial<Senior>, token: string, options?: WriteOptions) =>
      fetchJson<Senior>(`/api/seniors/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        token,
        idempotencyKey: options?.idempotencyKey,
      }),

    /** GET /api/seniors/:id/schedule */
    getSchedule: (id: string, token: string) =>
      fetchJson<{ schedule: unknown; topicsToAvoid: string[] }>(
        `/api/seniors/${id}/schedule`,
        { token },
      ),

    /** PATCH /api/seniors/:id/schedule */
    updateSchedule: (
      id: string,
      data: { schedule?: unknown; topicsToAvoid?: string[] },
      token: string,
      options?: WriteOptions,
    ) =>
      fetchJson<{ schedule: unknown; topicsToAvoid: string[] }>(
        `/api/seniors/${id}/schedule`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
          token,
          idempotencyKey: options?.idempotencyKey,
        },
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
      options?: WriteOptions,
    ) =>
      fetchJson<Reminder>("/api/reminders", {
        method: "POST",
        body: JSON.stringify(data),
        token,
        idempotencyKey: options?.idempotencyKey,
      }),

    /** PATCH /api/reminders/:id */
    update: (id: string, data: Partial<Reminder>, token: string, options?: WriteOptions) =>
      fetchJson<Reminder>(`/api/reminders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        token,
        idempotencyKey: options?.idempotencyKey,
      }),

    /** DELETE /api/reminders/:id */
    delete: (id: string, token: string, options?: WriteOptions) =>
      fetchJson<{ success: boolean }>(`/api/reminders/${id}`, {
        method: "DELETE",
        token,
        idempotencyKey: options?.idempotencyKey,
      }),
  },

  conversations: {
    /** GET /api/conversations -- lists all recent conversations (filtered by access) */
    list: (token: string) => fetchJson<Conversation[]>("/api/conversations", { token }),

    /** GET /api/seniors/:id/conversations -- conversations for a specific senior */
    listForSenior: (seniorId: string, token: string) =>
      fetchJson<Conversation[]>(`/api/seniors/${seniorId}/conversations`, { token }),
  },

  calls: {
    /** POST /api/call -- initiate an outbound call for an authorized senior */
    initiate: (seniorId: string, token: string, options?: WriteOptions) =>
      fetchJson<{ success: boolean; callSid: string }>("/api/call", {
        method: "POST",
        body: JSON.stringify({ seniorId }),
        token,
        idempotencyKey: options?.idempotencyKey,
      }),
  },

  notifications: {
    /** GET /api/notifications/preferences */
    getPreferences: (token: string) =>
      fetchJson<NotificationPreferences>("/api/notifications/preferences", { token }),

    /** PATCH /api/notifications/preferences */
    updatePreferences: (
      prefs: Partial<NotificationPreferences>,
      token: string,
      options?: WriteOptions,
    ) =>
      fetchJson<NotificationPreferences>("/api/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify(prefs),
        token,
        idempotencyKey: options?.idempotencyKey,
      }),

    /** GET /api/notifications?page=N -- paginated notification history (20 per page) */
    list: (page: number, token: string) =>
      fetchJson<DonnaNotification[]>(`/api/notifications?page=${page}`, { token }),

    /** PATCH /api/notifications/:id/read -- mark a notification as read */
    markRead: (id: string, token: string, options?: WriteOptions) =>
      fetchJson<DonnaNotification>(`/api/notifications/${id}/read`, {
        method: "PATCH",
        token,
        idempotencyKey: options?.idempotencyKey,
      }),
  },
};
