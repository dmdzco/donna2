import type { CaregiverProfile } from "../types";

export type PostAuthRoute = "/(tabs)" | "/(onboarding)/step1";

function isNeedsOnboardingError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "needsOnboarding" in error &&
    error.needsOnboarding === true
  );
}

export function getProfileQueryKey(userId?: string | null) {
  return ["profile", userId ?? "anonymous"] as const;
}

export function hasCompletedOnboarding(
  profile?: Pick<CaregiverProfile, "seniors"> | null,
) {
  return (profile?.seniors?.length ?? 0) > 0;
}

export function resolvePostAuthRoute({
  profile,
  error,
}: {
  profile?: Pick<CaregiverProfile, "seniors"> | null;
  error?: unknown;
}): PostAuthRoute | null {
  if (hasCompletedOnboarding(profile)) {
    return "/(tabs)";
  }

  if (isNeedsOnboardingError(error)) {
    return "/(onboarding)/step1";
  }

  if (profile) {
    return "/(onboarding)/step1";
  }

  return null;
}
