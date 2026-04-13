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
- `DONNA_API_KEY` env var for service-to-service calls on selected Node `/api/*` routes
- Constant-time comparison via `crypto.timingSafeEqual()`
- Route prefixes that own JWT/Clerk auth are exempt
- Disabled in development when key not set

---

## Twilio Webhook Validation

**File**: `pipecat/api/middleware/twilio.py`

All `/voice/*` endpoints verify Twilio's `X-Twilio-Signature` header:

- Uses `twilio.request_validator.RequestValidator` with `TWILIO_AUTH_TOKEN`
- Respects proxy headers (`X-Forwarded-Proto`, `X-Forwarded-Host`) for URL reconstruction
- **Production**: Rejects unsigned or invalid requests with 403
- **Development**: Logs warning but allows through for localhost testing
- Required env var: `TWILIO_AUTH_TOKEN` (500 error if missing)

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
| `InitiateCallRequest` | phone_number (E.164 normalized) |
| `AdminLoginRequest` | email, password |

Phone numbers are automatically normalized to E.164 format (`+1XXXXXXXXXX`).

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
- `JWT_SECRET` required in production (raises `RuntimeError` if missing)
- API keys stored as env vars, never committed to code
- Sentry configured with `send_default_pii=False`

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
