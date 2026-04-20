import Constants from "expo-constants";

type ExtraConfig = {
  apiUrl?: string;
  clerkPublishableKey?: string;
  sentryDsn?: string;
  eas?: {
    projectId?: string;
  };
};

function getExtraConfig(): ExtraConfig {
  return (Constants.expoConfig?.extra ?? {}) as ExtraConfig;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getPublicConfigValue(
  extraKey: keyof ExtraConfig,
  envKey: string,
): string | undefined {
  return readString(getExtraConfig()[extraKey]) ?? readString(process.env[envKey]);
}

function requirePublicConfigValue(
  extraKey: keyof ExtraConfig,
  envKey: string,
): string {
  const value = getPublicConfigValue(extraKey, envKey);
  if (value) return value;

  throw new Error(
    `${envKey} is required for the mobile app. Set it in apps/mobile/.env or the EAS environment.`,
  );
}

export function getApiUrl(): string {
  return requirePublicConfigValue("apiUrl", "EXPO_PUBLIC_API_URL").replace(/\/+$/, "");
}

export function getClerkPublishableKey(): string {
  return requirePublicConfigValue(
    "clerkPublishableKey",
    "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
  );
}

export function getSentryDsn(): string | undefined {
  return getPublicConfigValue("sentryDsn", "EXPO_PUBLIC_SENTRY_DSN");
}

export function getEasProjectId(): string | undefined {
  return readString(getExtraConfig().eas?.projectId);
}
