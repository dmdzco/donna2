# Security Architecture

> Security measures implemented across the Donna voice pipeline and API layer.

---

## Security Model Overview

Donna uses defense-in-depth with multiple layers:

```
Request → Security Headers → Rate Limiting → Authentication → Input Validation → Handler
                                                                                    │
                                                                                    ▼
                                                                           Error Handler
                                                                        (no internal leaks)
```

---

## Authentication (3-Tier)

**File**: `pipecat/api/middleware/auth.py`

Three authentication methods, checked in priority order:

| Tier | Method | Use Case | Header |
|------|--------|----------|--------|
| 1. Cofounder API Key | Static key (constant-time comparison) | Full access bypass | `X-Api-Key` |
| 2. Admin JWT | HS256 Bearer token | Admin dashboard | `Authorization: Bearer <token>` |
| 3. Clerk Session | RS256 session token | Consumer app users | `X-Clerk-Token` or `__session` cookie |

```python
# FastAPI dependency injection
@app.get("/api/seniors")
async def list_seniors(auth: AuthContext = Depends(require_auth)):
    ...
```

**AuthContext** returned for each request:
- `is_cofounder: bool` — full access
- `is_admin: bool` — admin-level access
- `user_id: str` — authenticated user identifier
- `clerk_user_id: str | None` — Clerk-specific ID

### Cofounder API Key Auth (`pipecat/api/middleware/auth.py`)
- `COFOUNDER_API_KEY_1` / `COFOUNDER_API_KEY_2` env vars provide full-access cofounder bypass
- Checked before admin JWT and Clerk session auth
- Use only for trusted operator/service access

### Node API Key Auth (`middleware/api-auth.js`)
- Production uses labeled `DONNA_API_KEYS` entries such as `pipecat:<key>,scheduler:<key>` for service-to-service calls
- `DONNA_API_KEY` is accepted only as a local/test compatibility fallback outside production
- Constant-time comparison via `crypto.timingSafeEqual()`
- Route prefixes that own JWT/Clerk auth are exempt
- Missing service keys fail closed in production

---

## Twilio Webhook Validation

**File**: `pipecat/api/middleware/twilio.py`

All `/voice/*` endpoints verify Twilio's `X-Twilio-Signature` header:

- Uses `twilio.request_validator.RequestValidator` with `TWILIO_AUTH_TOKEN`
- Uses `PIPECAT_PUBLIC_URL` for stable production URL reconstruction
- **Production**: Rejects unsigned or invalid requests with 403
- **Development/test**: Allows unsigned webhooks only when `ALLOW_UNSIGNED_TWILIO_WEBHOOKS=true`
- Required env var: `TWILIO_AUTH_TOKEN` (500 error if missing)

Twilio Media Stream WebSockets are gated separately:

- `/voice/answer` generates a random single-use `ws_token` and includes it in TwiML `<Stream>` parameters
- `/ws` rejects unknown `call_sid`, missing/invalid/expired/reused tokens before constructing STT/LLM/TTS services
- Tokens expire after five minutes only if unused; active calls are not disconnected by token expiry
- Redis-backed metadata is used when configured so multi-instance Pipecat can validate call state

---

## Rate Limiting

**File**: `pipecat/api/middleware/rate_limit.py`

Five rate limit tiers using `slowapi` (backed by in-memory storage, keyed by remote address):

| Tier | Limit | Applies To |
|------|-------|-----------|
| API General | 100/minute | All `/api/*` routes |
| Call Initiation | 5/minute | `POST /api/call` |
| Write Operations | 30/minute | POST/PUT/DELETE |
| Auth Endpoints | 10/minute | Login/token endpoints |
| Webhooks | 500/minute | Twilio callbacks |

---

## Security Headers

**File**: `pipecat/api/middleware/security.py`

Applied to all responses via `SecurityHeadersMiddleware`:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-XSS-Protection` | `1; mode=block` | XSS filter |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer info |
| `X-Request-Id` | UUID (from request or generated) | Request tracing |

---

## Input Validation

**File**: `pipecat/api/validators/schemas.py`

All API inputs validated via Pydantic models before reaching handlers:

| Schema | Validates |
|--------|----------|
| `CreateSeniorRequest` | name (1-255 chars), phone (E.164), timezone, interests |
| `UpdateSeniorRequest` | Same fields, all optional |
| `CreateMemoryRequest` | type (10 allowed values), content (1-5000 chars), importance (0-100) |
| `CreateReminderRequest` | type (5 allowed values), title (1-255), scheduled_time, cron |
| `InitiateCallRequest` | seniorId/senior_id; server resolves phone after authorization |
| `AdminLoginRequest` | email, password |

Caregiver/admin call initiation does not accept arbitrary client-supplied phone numbers. The API accepts a senior ID, checks authorization, then resolves the stored senior phone number server-side.

---

## PII Protection

**File**: `pipecat/lib/sanitize.py`

All log output passes through sanitization:

| Function | Input | Output |
|----------|-------|--------|
| `mask_phone("+15551234567")` | Full phone | `***4567` |
| `mask_name("David Zuluaga")` | Full name | `David Z.` |
| `truncate("long content", 30)` | Full text | `long content...` (truncated) |

Used across all service modules for Railway log output.

---

## Field-Level PHI Encryption

**Files**: `pipecat/lib/encryption.py`, `lib/encryption.js`

Donna stores newly persisted conversation transcripts and call summaries in AES-256-GCM encrypted companion columns:

- `conversations.transcript_encrypted` stores the structured turn list for authorized admin/export/post-call use.
- `conversations.transcript_text_encrypted` stores a plain-text transcript rendering for future retrieval and analysis.
- `conversations.summary_encrypted` stores call summaries used by caregiver and admin views.

The legacy plaintext `conversations.transcript` and `conversations.summary` columns remain read fallbacks for rows created before the encrypted migration and are included in retention purges. New transcript writes should not populate `conversations.transcript`.

Caregiver clients do not receive encrypted blobs or decryption keys. The Node API authenticates the caregiver, verifies per-senior access, decrypts the summary server-side, and returns summary-only call records via `/api/seniors/:id/calls`. Admin conversation routes may return decrypted transcripts for the admin transcript viewer.

---

## Error Handling

**File**: `pipecat/api/middleware/error_handler.py`

Global exception handlers prevent internal details from leaking:

- **Unhandled exceptions** → `500 {"error": "An internal error occurred"}` (no stack trace)
- **ValueError** → `400 {"error": "<message>"}` (safe validation errors)
- All errors logged with `X-Request-Id` for correlation
- Sentry integration captures full error context server-side

---

## CORS Policy

**File**: `pipecat/main.py` (lines 101-115)

| Environment | Allowed Origins |
|-------------|----------------|
| Production | `https://admin-v2-liart.vercel.app`, `ADMIN_URL` env var |
| Development | Above + `http://localhost:5173`, `http://localhost:3000` |

---

## Environment Variable Security

**File**: `pipecat/config.py`

- All env vars centralized in a `frozen=True` dataclass (immutable after load)
- `lru_cache(maxsize=1)` ensures single-load behavior
- `ENVIRONMENT=production` or `RAILWAY_PUBLIC_DOMAIN` enables production fail-closed behavior
- `JWT_SECRET`, `DONNA_API_KEYS`, `FIELD_ENCRYPTION_KEY`, `TWILIO_AUTH_TOKEN`, and `PIPECAT_PUBLIC_URL` are required in production
- Node also requires `CLERK_SECRET_KEY` for Clerk-authenticated routes in production
- `PIPECAT_REQUIRE_REDIS=true` requires `REDIS_URL` before horizontal scaling
- API keys stored as env vars, never committed to code
- Sentry configured with `send_default_pii=False`

### Deployment Checklist

Before promoting a production deployment:

- Set `ENVIRONMENT=production` on Railway services.
- Set `PIPECAT_PUBLIC_URL=https://...` to the public Pipecat service URL.
- Set labeled `DONNA_API_KEYS`; do not rely on legacy `DONNA_API_KEY` in production.
- Verify `FIELD_ENCRYPTION_KEY` decodes to 32 bytes.
- Verify `TWILIO_AUTH_TOKEN` exists on both Pipecat and Node services.
- Verify `CLERK_SECRET_KEY` exists on Node.
- Set `REDIS_URL` before running more than one Pipecat instance.
- Set Pipecat `LOG_LEVEL=INFO` for Railway dev/staging/prod before smoke testing or promotion.
- Verify Railway logs do not contain prompt context, transcripts, medical notes, caregiver notes, raw WebSocket parameters, or `ws_token` values.
- Smoke test real Twilio signatures, signed TwiML with `ws_token`, `/ws` token rejection/reuse, and a call longer than five minutes.

### Remaining PHI Encryption Action Item

The staged PHI encryption/export migration is intentionally separate from ingress/auth hardening.

Scope for that follow-up:

- Add encrypted companion columns for highest-risk plaintext PHI fields that are not yet covered, starting with senior medical notes, family info, additional info, call context snapshots, reminders, daily context, notifications, and caregiver notes.
- Backfill encrypted values in batches and log counts only.
- Change reads to prefer encrypted columns and fall back to plaintext only during the migration window.
- Update exports to decrypt only at the authorized boundary and fail on decryption errors rather than silently falling back to stale plaintext.
- Stop writing remaining plaintext PHI fields, then null/drop plaintext columns only after backfill verification and release validation.

---

## Security Audit Summary

9 findings from the February 2026 security audit — all resolved:

| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| 1 | No authentication on API routes | CRITICAL | 3-tier auth middleware |
| 2 | No Twilio webhook validation | HIGH | X-Twilio-Signature verification |
| 3 | No input validation | HIGH | Pydantic schemas on all endpoints |
| 4 | No rate limiting | HIGH | 5-tier slowapi rate limiting |
| 5 | No security headers | MEDIUM | SecurityHeadersMiddleware |
| 6 | Sensitive data in logs | MEDIUM | PII sanitization (sanitize.py) |
| 7 | Error messages leak internals | MEDIUM | Global error handler |
| 8 | No audit trail | MEDIUM | Sentry + request ID tracking |
| 9 | No request body size limits | LOW | FastAPI default + Pydantic max_length |

---

## Key Files

| File | Purpose |
|------|---------|
| `pipecat/api/middleware/auth.py` | 3-tier authentication (109 LOC) |
| `middleware/api-auth.js` | Node service API key auth with constant-time comparison |
| `pipecat/api/middleware/twilio.py` | Twilio webhook signature validation (53 LOC) |
| `pipecat/api/middleware/rate_limit.py` | 5-tier rate limiting config (17 LOC) |
| `pipecat/api/middleware/security.py` | Security headers (31 LOC) |
| `pipecat/api/middleware/error_handler.py` | Safe error responses (34 LOC) |
| `pipecat/api/validators/schemas.py` | Pydantic input schemas (143 LOC) |
| `pipecat/lib/sanitize.py` | PII masking utilities (39 LOC) |
| `pipecat/config.py` | Centralized env vars (132 LOC) |
