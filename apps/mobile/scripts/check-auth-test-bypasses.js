#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const files = [
  "app/(auth)/sign-in.tsx",
  "app/(auth)/create-account.tsx",
  "src/lib/auth.ts",
];

const forbiddenPatterns = [
  {
    pattern: /__DEV__/,
    reason: "auth flow must not branch on dev/test builds",
  },
  {
    pattern: /424242/,
    reason: "test auth codes belong in Maestro flows, not app code",
  },
  {
    pattern: /clerk_test/i,
    reason: "Clerk test-account details belong in Maestro flows, not app code",
  },
  {
    pattern: /auto-?verify|auto-?2fa/i,
    reason: "auth challenges must be completed through visible UI",
  },
  {
    pattern: /secureTextEntry=\{!\s*__DEV__\}/,
    reason: "password fields must not change behavior for test builds",
  },
];

const failures = [];

for (const relativeFile of files) {
  const filePath = path.join(repoRoot, relativeFile);
  if (!fs.existsSync(filePath)) continue;

  const source = fs.readFileSync(filePath, "utf8");
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const { pattern, reason } of forbiddenPatterns) {
      if (pattern.test(line)) {
        failures.push(`${relativeFile}:${index + 1} ${reason}`);
      }
    }
  });
}

if (failures.length > 0) {
  console.error("Mobile auth test-only bypass guard failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Mobile auth test-only bypass guard passed.");
