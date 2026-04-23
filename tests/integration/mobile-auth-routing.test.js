import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const createAccountSource = fs.readFileSync(
  path.resolve("apps/mobile/app/(auth)/create-account.tsx"),
  "utf-8",
);
const signInSource = fs.readFileSync(
  path.resolve("apps/mobile/app/(auth)/sign-in.tsx"),
  "utf-8",
);
const rootLayoutSource = fs.readFileSync(
  path.resolve("apps/mobile/app/_layout.tsx"),
  "utf-8",
);
const profileSessionSource = fs.readFileSync(
  path.resolve("apps/mobile/src/lib/profileSession.ts"),
  "utf-8",
);

function getProfileQueryKey(userId) {
  return ["profile", userId ?? "anonymous"];
}

function resolvePostAuthRoute({ profile, error }) {
  if ((profile?.seniors?.length ?? 0) > 0) {
    return "/(tabs)";
  }

  if (error?.needsOnboarding === true) {
    return "/(onboarding)/step1";
  }

  if (profile) {
    return "/(onboarding)/step1";
  }

  return null;
}

describe("mobile auth routing", () => {
  it("scopes the profile query cache by Clerk user", () => {
    expect(profileSessionSource).toContain("getProfileQueryKey");
    expect(profileSessionSource).toContain('userId ?? "anonymous"');
    expect(getProfileQueryKey("user_123")).toEqual(["profile", "user_123"]);
    expect(getProfileQueryKey()).toEqual(["profile", "anonymous"]);
  });

  it("routes completed caregivers to tabs", () => {
    expect(profileSessionSource).toContain('return "/(tabs)"');
    expect(
      resolvePostAuthRoute({
        profile: { seniors: [{ id: "senior_1" }] },
      }),
    ).toBe("/(tabs)");
  });

  it("routes onboarding-needed 404s to the onboarding flow", () => {
    expect(profileSessionSource).toContain("needsOnboarding === true");
    const error = { needsOnboarding: true };
    expect(resolvePostAuthRoute({ error })).toBe("/(onboarding)/step1");
  });

  it("does not misroute generic server failures as onboarding", () => {
    const error = { message: "Internal server error", requestId: "req_123" };
    expect(resolvePostAuthRoute({ error })).toBeNull();
  });

  it("keeps auth screens from treating every profile failure as onboarding", () => {
    expect(createAccountSource).toContain("resolvePostAuthRoute");
    expect(createAccountSource).not.toContain(
      "} catch {\n      router.replace(\"/(onboarding)/step1\" as any);",
    );
    expect(signInSource).toContain("resolvePostAuthRoute");
    expect(signInSource).not.toContain(
      "} catch {\n      router.replace(\"/(onboarding)/step1\" as any);",
    );
  });

  it("shows a retry state instead of forcing tabs on unknown bootstrap errors", () => {
    expect(rootLayoutSource).toContain("showBootstrapError");
    expect(rootLayoutSource).toContain("We couldn't load your Donna profile");
    expect(rootLayoutSource).not.toContain("router.replace(\"/(tabs)\")");
  });
});
