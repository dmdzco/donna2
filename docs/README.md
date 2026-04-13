# New Engineer Prototype TODOs

This is the starter backlog for getting Donna ready to test with real prototype users before a full production launch.

Priority definitions:

- P0: Must work before putting the prototype in front of people.
- P1: Should fix before a wider beta, but not a first-pilot blocker.
- P2: Good cleanup once the main pilot path is stable.

Before starting any item:

- Read [`../DIRECTORY.md`](../DIRECTORY.md) to confirm the active surface.
- Work on one small branch per task.
- Use dummy test accounts until the pilot starts.
- Do not put real transcripts, reminder text, medical notes, phone numbers, names, or caregiver data in logs, fixtures, screenshots, or PR notes.
- Prefer mocked tests and local builds before any Railway dev deploy. Use Railway dev only when validating real calls, real scheduler behavior, or environment wiring.

## Priority 0 - Prototype Pilot Blockers

| Priority | Task | Files | Done when | Validation |
|---|---|---|---|---|
| P0 | Prove mobile login and sign-up. | `apps/mobile/app/(auth)/sign-in.tsx`, `apps/mobile/app/(auth)/create-account.tsx`, `apps/mobile/app/_layout.tsx`, `apps/mobile/src/lib/auth.ts` | A new caregiver can create an account with a dummy test user, sign in, sign out, sign back in, and recover from bad credentials without a crash or stuck loading state. Session persistence and redirect behavior are predictable after app restart. | `cd apps/mobile && npm run test:e2e:auth`; manual simulator pass with a dummy Clerk test user |
| P0 | Prove the mobile onboarding path. | `apps/mobile/app/(onboarding)/`, `apps/mobile/src/stores/onboarding.ts`, `routes/onboarding.js` | A fresh caregiver can sign in, create/link a loved one, add the first reminder/call schedule, land on the dashboard, quit, reopen, and still see the right state. | `cd apps/mobile && npm run test:e2e:onboarding`; manual simulator pass with a dummy Clerk test user |
| P0 | Prove mobile reminder CRUD works end to end. | `apps/mobile/app/(tabs)/reminders.tsx`, `apps/mobile/src/hooks/useReminders.ts`, `apps/mobile/src/lib/api.ts`, `routes/reminders.js`, `validators/schemas.js` | A caregiver can create, edit, refresh, and delete a reminder from the mobile app. The time picker can change a new reminder away from 9:00 AM, and the saved reminder displays in the senior's local time. Errors show actionable API messages, not a generic failure. | `cd apps/mobile && npm run test:e2e:reminders`; `npm test` |
| P0 | Prove reminder delivery works in a dev call. | `services/scheduler.js`, `routes/reminders.js`, `pipecat/services/reminder_delivery.py`, `pipecat/flows/tools.py` | A reminder created through the app or API is picked up by the active Node scheduler using the senior profile timezone, Donna mentions it in the dev call, and delivery state is updated. Start in Node; only touch Pipecat if the reminder reaches the call but is not mentioned or marked. | `make deploy-dev`; test with the dev Twilio number and a dummy/consenting pilot phone; verify DB/admin state and logs |
| P0 | Prove the mobile schedule and call controls. | `apps/mobile/app/(tabs)/schedule.tsx`, `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/src/lib/api.ts`, `routes/calls.js` | A caregiver can view/edit the call schedule in the senior's local time, and the dashboard call action handles success and failure without hanging or crashing. | `cd apps/mobile && npm run test:e2e:schedule`; manual simulator pass against dev API |
| P0 | Run a mobile no-crash pass through all main screens. | `apps/mobile/app/_layout.tsx`, `apps/mobile/app/(tabs)/`, `apps/mobile/app/settings/`, `apps/mobile/src/components/` | Sign-in, dashboard, schedule, reminders, settings, loved-one profile, caregiver profile, notification settings, help, and sign-out confirmation are navigable without crashes or stuck modals. | `cd apps/mobile && npm run test:e2e`; manual physical iPhone pass if available |
| P0 | Remove pilot-blocking sensitive debug logs. | `apps/consumer/src/pages/Onboarding.tsx`, `routes/calls.js`, `apps/mobile/app/_layout.tsx` | Browser/mobile/server logs do not print raw onboarding payloads, full dialed phone numbers, or push tokens. | `cd apps/consumer && npm run build`; `cd apps/mobile && npx tsc --noEmit`; `npm test` |

## Priority 1 - Wider Beta Hardening

| Priority | Task | Files | Done when | Validation |
|---|---|---|---|---|
| P1 | Make the mobile Maestro flows reliable enough to run before every pilot build. | `apps/mobile/.maestro/flows/` | The flows assert real user outcomes and avoid unnecessary sleeps or brittle selectors. | `cd apps/mobile && npm run test:e2e` |
| P1 | Add focused API coverage for reminders and schedules. | `tests/`, `routes/reminders.js`, `routes/seniors.js`, `validators/schemas.js` | Reminder create/update/delete and schedule update behavior are covered without using real PHI. | `npm test` |
| P1 | Replace placeholder store links on the consumer landing page. | `apps/consumer/src/pages/Landing.tsx` | App Store and Google Play actions no longer use dead `#` links. If store URLs are not ready, route users to the waitlist or clearly say the app is coming soon. | `cd apps/consumer && npm run build`; `npm run test:e2e:consumer` |
| P1 | Make the consumer FAQ Playwright test use semantic selectors. | `tests/e2e/consumer/landing.spec.ts` | The test avoids `.cursor-pointer` and asserts that opening a FAQ reveals answer content. | `npm run test:e2e:consumer` |
| P1 | Replace fixed sleeps in admin E2E tests with assertions. | `tests/e2e/admin/seniors.spec.ts`, `tests/e2e/admin/reminders.spec.ts` | `waitForTimeout()` calls are replaced with `expect(...)` checks on a success state, list update, or mocked API call. | `npm run test:e2e:admin` |

## Priority 2 - Polish And Docs

| Priority | Task | Files | Done when | Validation |
|---|---|---|---|---|
| P2 | Add a first-pilot checklist to the onboarding guide. | `docs/ONBOARDING.md` | A new engineer can find the pilot validation flow, test commands, and PHI logging reminder in one place. | Review rendered Markdown |
| P2 | Update root README documentation links if responsibilities drift. | `README.md`, `DIRECTORY.md` | The root README points to the current docs and does not contradict `DIRECTORY.md`. | Review rendered Markdown |
| P2 | Add one focused E2E assertion for observability navigation. | `tests/e2e/observability/navigation.spec.ts` | At least one navigation path has a deterministic expected heading, panel, or URL assertion. | `npm run test:e2e:observability` |

## Save For Later

These areas are important, but they are not good first tasks unless paired with an experienced reviewer:

- Major voice behavior, prompts, Director, Quick Observer, and post-call analysis changes in `pipecat/`.
- Database schema or migration changes in `db/` and `pipecat/db/`.
- Data retention, audit logging, encryption, and token revocation changes across Node and Python.
- Production deploy work before the dev pilot path is repeatable.
