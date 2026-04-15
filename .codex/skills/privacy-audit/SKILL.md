---
name: privacy-audit
description: Review Donna for HIPAA, PHI handling, auth, encryption, audit logging, retention, and data exposure risks. Use when changing API routes, middleware, logging, exports, deletions, reminders, transcript storage, memory storage, caregiver data flows, compliance docs, or any code touching sensitive user data across `pipecat/` and the repo-root Node service.
---

# Privacy Audit

Treat code as the runtime source of truth and compliance docs as intent. If docs and code diverge, call that out explicitly.

## Workflow

1. Read `DIRECTORY.md` to locate the active implementation.
2. Load only the compliance/architecture docs needed for context:
   - `docs/compliance/HIPAA_OVERVIEW.md`
   - `docs/compliance/BAA_TRACKER.md`
   - `docs/compliance/DATA_RETENTION_POLICY.md`
   - `docs/architecture/SECURITY.md`
3. Inspect the changed code path and any mirrored Python/Node implementation.
4. Review how the code authenticates, authorizes, logs, stores, exports, deletes, and transmits sensitive data.
5. Report findings first, ordered by severity, with file references and concrete exploit/regression impact.

## Donna-Specific Audit Areas

- Authentication and authorization:
  - `pipecat/api/middleware/`
  - `middleware/`
  - `routes/admin-auth.js`
  - `pipecat/api/routes/auth.py`
- PHI encryption, sanitization, and logging:
  - `pipecat/lib/encryption.py`
  - `lib/encryption.js`
  - `pipecat/lib/sanitize.py`
  - `lib/logger.js`
  - Sentry and error-handling paths
- Audit, revocation, and retention:
  - `pipecat/services/audit.py`
  - `services/audit.js`
  - `pipecat/services/token_revocation.py`
  - `services/token-revocation.js`
  - `pipecat/services/data_retention.py`
  - `services/data-retention.js`
- Export/delete and sensitive CRUD paths:
  - `pipecat/api/routes/export.py`
  - senior, conversation, memory, reminder, caregiver, and onboarding routes
- Encrypted-field invariants:
  - When encrypted companion columns exist, new PHI writes should store the sensitive body only in the encrypted column.
  - Plaintext companion columns such as conversation summaries/transcripts, memory content, call analysis details, concerns, and similar fields are legacy read fallbacks only unless a minimized non-PHI placeholder is required by the schema.
  - Authorized export routes may decrypt at the response boundary after auth and per-resource authorization; they should not return encrypted blobs or silently prefer stale plaintext over available encrypted values.
  - Retention and deletion flows must cover any new encrypted cache/table that can hold PHI, including replay/idempotency caches.
  - Replay/idempotency caches must not store raw request bodies or raw resource paths; use encrypted response payloads and stable keyed hashes for matching inputs.
- Third-party exposure:
  - Twilio
  - Anthropic
  - OpenAI
  - Google/Gemini
  - Deepgram
  - ElevenLabs
  - any search or analytics provider receiving PHI

## Red Flags

- Raw transcripts, reminders, or medical notes logged or sent to error tooling.
- Pipecat or Railway environments running with `LOG_LEVEL=DEBUG` and emitting prompt context, transcripts, caregiver notes, medical notes, raw WebSocket parameters, or one-time `ws_token` values.
- New routes that bypass existing auth middleware.
- Python and Node implementations drifting on security-sensitive behavior.
- Sensitive fields stored or returned in plaintext when encrypted or minimized alternatives already exist.
- Export paths that drop encrypted columns, forget to decrypt encrypted values for authorized users, or expose ciphertext to caregivers/admins.
- Encrypted replay/cache tables that store PHI-bearing responses without expiration cleanup.
- Hardcoded secrets, debug bypasses, or "temporary" auth exemptions.
- Retention/export/delete flows that miss mirrored tables or companion encrypted columns.

## Deployment Log Hygiene

- Before main/prod promotion, verify Pipecat `LOG_LEVEL=INFO` in Railway dev/staging/prod.
- If `DEBUG` is temporarily required for an incident, treat logs as PHI-bearing, keep the window short, and confirm no prompt context, raw transcripts, medical notes, caregiver notes, WebSocket parameters, or `ws_token` values are retained in normal logs.
- Security smoke tests must include a log review after the live Twilio call, not just HTTP/WebSocket success.

## Output

- Present findings first, ordered by severity.
- Explain the concrete privacy/security impact, not just the coding style issue.
- Call out open questions separately when a conclusion depends on environment or vendor configuration.
- If no issues are found, state that explicitly and note residual risks such as missing BAA coverage or unverified production configuration.
