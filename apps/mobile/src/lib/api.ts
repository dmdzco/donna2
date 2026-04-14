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

const DEFAULT_TIMEOUT_MS = 15000;

export type ApiErrorKind =
  | "network"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limit"
  | "server"
  | "unknown";

function classifyStatus(status: number): ApiErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422 || status === 400) return "validation";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "unknown";
}

function requestIdFrom(body: Record<string, unknown>, res?: Response) {
  const bodyRequestId =
    typeof body.requestId === "string" ? body.requestId : undefined;
  return bodyRequestId ?? res?.headers.get("x-request-id") ?? undefined;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function fetchJson<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { token, ...fetchOpts } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((fetchOpts.headers as Record<string, string>) ?? {}),
  };

  const controller = new AbortController();
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, DEFAULT_TIMEOUT_MS);

  const sourceSignal = fetchOpts.signal;
  const abortFromSource = () => controller.abort();
  sourceSignal?.addEventListener("abort", abortFromSource);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${endpoint}`, {
      ...fetchOpts,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (didTimeout || isAbortError(error)) {
      throw ApiError.timeout();
    }
    throw ApiError.network();
  } finally {
    clearTimeout(timeout);
    sourceSignal?.removeEventListener("abort", abortFromSource);
  }

  if (!res.ok) {
    const body = asRecord(await res.json().catch(() => ({})));
    throw new ApiError(
      typeof body.error === "string" || typeof body.message === "string"
        ? String(body.error ?? body.message)
        : `HTTP ${res.status}`,
      res.status,
      body,
      classifyStatus(res.status),
      requestIdFrom(body, res),
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Typed API error with status code and response body */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown>,
    public kind: ApiErrorKind = classifyStatus(status),
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static network() {
    return new ApiError("Network request failed", 0, {}, "network");
  }

  static timeout() {
    return new ApiError("Request timed out", 0, {}, "timeout");
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

  /** Production-safe message for caregiver-facing UI. */
  get displayMessage() {
    return getErrorMessage(this);
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

export type ErrorMessageContext = "load" | "save" | "delete" | "call" | "auth";

export function isRetryableApiError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return (
    error.kind === "network" ||
    error.kind === "timeout" ||
    error.kind === "rate_limit" ||
    error.kind === "server"
  );
}

/**
 * Extract a production-safe user-facing error message.
 * Keep raw backend messages out of UI because these paths can touch PHI.
 */
export function getErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
  context: ErrorMessageContext = "load",
): string {
  if (error instanceof ApiError) {
    if (context === "call") {
      if (error.kind === "network" || error.kind === "timeout") {
        return "Donna needs a steady internet connection to start the call. Check your connection and try again. If this is urgent, call your loved one directly.";
      }
      if (error.kind === "server" || error.kind === "rate_limit") {
        return "Donna couldn't start the call right now. Please try again in a moment. If this is urgent, call your loved one directly.";
      }
    }

    if (context === "save") {
      if (error.kind === "network" || error.kind === "timeout") {
        return "We couldn't save this because the connection dropped. Your changes are still here. Check your connection and try again.";
      }
      if (error.kind === "server" || error.kind === "rate_limit") {
        return "We couldn't save this right now. Your changes are still here. Please try again in a moment.";
      }
    }

    if (context === "delete") {
      if (error.kind === "network" || error.kind === "timeout") {
        return "We couldn't delete this because the connection dropped. Check your connection and try again.";
      }
      if (error.kind === "server" || error.kind === "rate_limit") {
        return "We couldn't delete this right now. Please try again in a moment.";
      }
    }

    switch (error.kind) {
      case "network":
        return "You're offline or the connection dropped. Check your connection and try again.";
      case "timeout":
        return "Donna is taking too long to respond. Check your connection and try again.";
      case "unauthorized":
        return "Please sign in again to continue.";
      case "forbidden":
        return "You don't have access to that information.";
      case "not_found":
        return error.needsOnboarding
          ? "Finish setup to continue."
          : "We couldn't find that information. Please try again.";
      case "validation":
        return "Check the information and try again.";
      case "conflict":
        return "That information is already in use. Check it and try again.";
      case "rate_limit":
        return "Too many attempts. Wait a moment and try again.";
      case "server":
        return "Donna couldn't reach the server. Please try again in a moment.";
      default:
        return fallback;
    }
  }
  return fallback;
}

export const api = {
  caregivers: {
    /** GET /api/caregivers/me -- returns current user's profile + linked seniors */
    me: (token: string) => fetchJson<CaregiverProfile>("/api/caregivers/me", { token }),
  },

  account: {
    /** DELETE /api/caregivers/me/account -- deletes the current caregiver account */
    delete: (token: string) =>
      fetchJson<AccountDeletionResult>("/api/caregivers/me/account", {
        method: "DELETE",
        token,
      }),
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
      fetchJson<{ schedule: unknown; topicsToAvoid: string[] }>(
        `/api/seniors/${id}/schedule`,
        { token },
      ),

    /** PATCH /api/seniors/:id/schedule */
    updateSchedule: (
      id: string,
      data: { schedule?: unknown; topicsToAvoid?: string[] },
      token: string,
    ) =>
      fetchJson<{ schedule: unknown; topicsToAvoid: string[] }>(
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
    /** POST /api/call -- initiate an outbound call for an authorized senior */
    initiate: (seniorId: string, token: string) =>
      fetchJson<{ success: boolean; callSid: string }>("/api/call", {
        method: "POST",
        body: JSON.stringify({ seniorId }),
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
