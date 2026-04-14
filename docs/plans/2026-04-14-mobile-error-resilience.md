# Mobile Error And Connection Resilience

Branch: `codex/mobile-error-resilience`

Goal: make Donna's mobile app fail clearly and safely under poor network, backend errors, expired auth, and unexpected crashes. The caregiver should always know whether a change was saved, whether Donna can start a call, and what to do next.

## Guardrails

- Do not log caregiver-entered context, reminder text, senior names, phone numbers, transcripts, medical notes, or other PHI.
- Do not silently queue profile, reminder, schedule, or call writes until encrypted local storage and idempotency keys are designed.
- Show production-safe recovery copy. Keep raw backend messages and status codes out of caregiver-facing UI.
- Prefer one obvious recovery action: retry, sign in again, or call directly if urgent.

## Checklist

- [x] Create a dedicated implementation branch.
- [x] Add this checklist before changing app behavior.
- [x] Add request timeout handling to the mobile API client.
- [x] Classify network, timeout, unauthorized, validation, conflict, rate-limit, server, and unknown API errors.
- [x] Replace raw status-code display with caregiver-safe messages.
- [x] Add a global offline banner.
- [x] Connect React Query to network state and set deliberate retry defaults.
- [x] Keep failed writes on screen with clear retry copy.
- [x] Make instant-call failure copy explicit and non-emergency.
- [x] Hide raw crash/error details from the production error boundary.
- [x] Run TypeScript and auth guard checks.
- [x] Review for PHI leakage in logs and user-facing errors.

## Later Work

- [ ] Add encrypted local drafts for long forms.
- [ ] Add idempotency keys for write requests.
- [ ] Add request IDs from backend responses to support flows.
- [ ] Add real-device tests for airplane mode, slow network, app background/resume, and expired auth.
- [ ] Add Sentry or equivalent with strict PHI scrubbing.
