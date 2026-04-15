import type { ComponentType, ErrorInfo } from "react";
import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";
import type { Breadcrumb, ErrorEvent } from "@sentry/react-native";

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const isEnabled = Boolean(SENTRY_DSN);

if (isEnabled) {
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: true,
    environment: __DEV__ ? "development" : "production",
    release: Constants.expoConfig?.version
      ? `donna-mobile@${Constants.expoConfig.version}`
      : undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enableLogs: false,
    enableCaptureFailedRequests: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    maxBreadcrumbs: 20,
    normalizeDepth: 3,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}

export function captureBoundaryException(error: Error, errorInfo?: ErrorInfo) {
  if (!isEnabled) return;

  Sentry.captureException(error, {
    extra: {
      componentStack: scrubString(errorInfo?.componentStack ?? undefined),
    },
  });
}

export function withErrorReporting<P extends object>(
  Component: ComponentType<P>,
): ComponentType<P> {
  if (!isEnabled) return Component;
  return Sentry.wrap(
    Component as unknown as ComponentType<Record<string, unknown>>,
  ) as unknown as ComponentType<P>;
}

function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  const sanitized = scrubValue(event) as ErrorEvent;
  delete sanitized.user;
  delete sanitized.request;

  if (sanitized.message) sanitized.message = "[redacted]";
  if (sanitized.exception?.values) {
    sanitized.exception.values = sanitized.exception.values.map((exception) => ({
      ...exception,
      value: exception.type ? `[redacted ${exception.type}]` : "[redacted]",
    }));
  }

  return sanitized;
}

function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  return scrubValue(breadcrumb) as Breadcrumb;
}

function scrubValue(value: unknown, key = ""): unknown {
  if (value == null) return value;
  if (typeof value === "string") return scrubString(value, key);
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => scrubValue(item, key));
  }

  const safe: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (isSensitiveKey(entryKey)) {
      safe[entryKey] = "[redacted]";
    } else {
      safe[entryKey] = scrubValue(entryValue, entryKey);
    }
  }
  return safe;
}

function scrubString(value: string | undefined, key = "") {
  if (!value) return value;
  if (isSensitiveKey(key)) return "[redacted]";
  if (looksLikeEmail(value) || looksLikePhone(value)) return "[redacted]";
  if (value.length > 120) return "[redacted]";
  return value;
}

function isSensitiveKey(key: string) {
  return /name|phone|email|address|city|state|zip|reminder|description|topic|interest|medical|transcript|summary|content|family|caregiver|senior|token|authorization|password|cookie|secret|dsn/i.test(
    key,
  );
}

function looksLikeEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value);
}

function looksLikePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10;
}
