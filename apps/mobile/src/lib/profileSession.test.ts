import { describe, expect, it } from "vitest";
import {
  getProfileQueryKey,
  hasCompletedOnboarding,
  resolvePostAuthRoute,
} from "./profileSession";

function makeSenior() {
  return {
    id: "senior-1",
    name: "Test Senior",
    phone: "+15558675309",
    isActive: true,
    createdAt: "2035-01-01T00:00:00.000Z",
    updatedAt: "2035-01-01T00:00:00.000Z",
  };
}

describe("profile session routing", () => {
  it("uses a stable anonymous profile query key before auth is ready", () => {
    expect(getProfileQueryKey()).toEqual(["profile", "anonymous"]);
    expect(getProfileQueryKey("user-1")).toEqual(["profile", "user-1"]);
  });

  it("routes signed-in caregivers with seniors to tabs", () => {
    const profile = { seniors: [makeSenior()] };

    expect(hasCompletedOnboarding(profile)).toBe(true);
    expect(resolvePostAuthRoute({ profile })).toBe("/(tabs)");
  });

  it("routes missing profiles and explicit onboarding errors to onboarding", () => {
    expect(resolvePostAuthRoute({ profile: { seniors: [] } })).toBe("/(onboarding)/step1");
    expect(resolvePostAuthRoute({ error: { needsOnboarding: true } })).toBe("/(onboarding)/step1");
  });

  it("waits when profile loading has neither data nor onboarding error", () => {
    expect(resolvePostAuthRoute({})).toBeNull();
  });
});
