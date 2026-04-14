---
name: mobile-auth-e2e
description: Use when changing or reviewing Donna's mobile authentication, Clerk sign-in/sign-up flows, password reset, second-factor challenges, or Maestro mobile auth tests in `apps/mobile/`. Ensures test accounts and automation exercise the same visible UI a caregiver uses, with no app-code auth bypasses.
---

# Mobile Auth E2E

Use this for Donna mobile auth work in `apps/mobile/`.

## Workflow

1. Read `DIRECTORY.md` and confirm the target is the active mobile app.
2. Inspect the affected screen in `apps/mobile/app/(auth)/` and the relevant Maestro flow or subflow in `apps/mobile/.maestro/`.
3. Treat Clerk auth as a state machine. Every provider response must land in an explicit user-visible state:
   - `complete` -> activate session and navigate.
   - `needs_second_factor` -> show a factor chooser or code input.
   - password reset / new password states -> show the matching form.
   - unsupported states -> show a clear recovery message.
4. Keep test-only behavior out of app control flow. Do not hardcode Clerk test codes, `clerk_test` accounts, `__DEV__` auth branches, or dev-only password field behavior in app code.
5. Put test-account details in Maestro only. Maestro may use Clerk test codes, but it must enter them through the same visible fields a caregiver sees, such as `auth-verification-code` and `auth-verification-submit`.
6. Validate the smallest useful surface:
   - `cd apps/mobile && npm run test:auth-guard`
   - `cd apps/mobile && npx tsc --noEmit`
   - `cd apps/mobile && maestro check-syntax .maestro/subflows/sign_in.yaml`
   - For configured 2FA test users: `cd apps/mobile && npm run test:e2e:auth-2fa`

## Guardrails

- Do not bypass Clerk challenge states to make Maestro pass.
- Do not make final-dashboard assertions the only auth coverage; assert the intermediate challenge UI when auth can branch.
- Keep password, code, and account details out of logs, screenshots, and app comments.
- Prefer one obvious next step in auth UI. A user who receives a code must see where it goes.
