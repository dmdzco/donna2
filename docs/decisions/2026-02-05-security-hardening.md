# Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the Donna API against unauthorized access, input abuse, and data leakage while maintaining production stability.

**Architecture:** Four independent workstreams creating NEW files (middleware/, lib/) to avoid merge conflicts. Each workstream installs its own npm dependencies and creates isolated modules. A final integration step wires everything into index.js.

**Tech Stack:** express-rate-limit, helmet, express-validator, Twilio request validation (built-in), pino (structured logger)

---

## Security Audit Findings

| # | Issue | Severity | Current State |
|---|-------|----------|---------------|
| 1 | Zero authentication on all API routes | CRITICAL | Anyone can CRUD seniors, memories, conversations, reminders |
| 2 | No Twilio webhook validation | HIGH | `/voice/answer`, `/voice/status` accept requests from anyone |
| 3 | No input validation | HIGH | POST/PATCH routes pass `req.body` straight to DB |
| 4 | No rate limiting | HIGH | All endpoints unlimited |
| 5 | No security headers | MEDIUM | No helmet, no HSTS, no CSP |
| 6 | Sensitive data in logs | MEDIUM | Phone numbers, names logged in plaintext across all services |
| 7 | Error messages leak internals | MEDIUM | `error.message` returned to clients in all catch blocks |
| 8 | No audit trail | MEDIUM | No record of who accessed what data |
| 9 | No request body size limits | LOW | Express default 100kb, but no explicit control |

---

## Workstream Assignments (Parallel - No File Conflicts)

| Agent | Workstream | Files Created/Modified | Dependencies |
|-------|-----------|----------------------|--------------|
| **Agent 1** | Security Headers + Rate Limiting | `middleware/security.js`, `middleware/rate-limit.js` | helmet, express-rate-limit |
| **Agent 2** | Input Validation + Error Handling | `middleware/validation.js`, `middleware/error-handler.js` | express-validator |
| **Agent 3** | Twilio Webhook Auth + API Key Auth | `middleware/twilio-auth.js`, `middleware/api-auth.js` | twilio (already installed) |
| **Agent 4** | Log Sanitization + PII Protection | `lib/logger.js`, `lib/sanitize.js`, updates to `services/*.js` | pino |
| **Lead** | Final Integration | `index.js` (wire middleware) | After agents 1-4 complete |

---

## Task 1: Security Headers + Rate Limiting (Agent 1)

**Files:**
- Create: `middleware/security.js`
- Create: `middleware/rate-limit.js`

**Step 1: Install dependencies**

```bash
npm install helmet express-rate-limit
```

**Step 2: Create `middleware/security.js`**

```javascript
import helmet from 'helmet';

/**
 * Security headers middleware using helmet.
 * - Sets X-Content-Type-Options, X-Frame-Options, etc.
 * - CSP configured for admin dashboard (allows inline scripts for now)
 */
export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // admin.html uses inline scripts
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow cross-origin resources
  });
}

/**
 * Request ID middleware - adds unique ID to each request for tracing.
 */
export function requestId() {
  return (req, res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  };
}
```

**Step 3: Create `middleware/rate-limit.js`**

```javascript
import rateLimit from 'express-rate-limit';

/**
 * General API rate limit - 100 requests per 15 minutes per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/**
 * Stricter rate limit for call initiation - 10 per 15 minutes per IP.
 * Prevents abuse of Twilio outbound calling.
 */
export const callLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many call requests, please try again later.' },
});

/**
 * Webhook rate limit - generous but bounded - 500 per minute.
 * Twilio sends many rapid webhook requests during calls.
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
```

**Step 4: Commit**

```bash
git add middleware/security.js middleware/rate-limit.js package.json package-lock.json
git commit -m "feat: add security headers and rate limiting middleware"
```

---

## Task 2: Input Validation + Error Handling (Agent 2)

**Files:**
- Create: `middleware/validation.js`
- Create: `middleware/error-handler.js`

**Step 1: Install dependencies**

```bash
npm install express-validator
```

**Step 2: Create `middleware/validation.js`**

Validation schemas for every POST/PATCH route:

```javascript
import { body, param, query } from 'express-validator';

// Reusable UUID param validator
export const uuidParam = (name = 'id') =>
  param(name).isUUID().withMessage(`${name} must be a valid UUID`);

// POST /api/seniors
export const createSenior = [
  body('name').trim().notEmpty().isLength({ max: 255 }).withMessage('Name is required (max 255 chars)'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('timezone').optional().isString().isLength({ max: 100 }),
  body('interests').optional().isArray(),
  body('interests.*').optional().isString().isLength({ max: 255 }),
  body('familyInfo').optional().isObject(),
  body('medicalNotes').optional().isString().isLength({ max: 5000 }),
  body('preferredCallTimes').optional().isObject(),
];

// PATCH /api/seniors/:id
export const updateSenior = [
  uuidParam(),
  body('name').optional().trim().isLength({ max: 255 }),
  body('phone').optional().trim(),
  body('timezone').optional().isString().isLength({ max: 100 }),
  body('interests').optional().isArray(),
  body('familyInfo').optional().isObject(),
  body('medicalNotes').optional().isString().isLength({ max: 5000 }),
];

// POST /api/seniors/:id/memories
export const createMemory = [
  uuidParam(),
  body('content').trim().notEmpty().isLength({ max: 2000 }).withMessage('Content is required (max 2000 chars)'),
  body('type').optional().isIn(['fact', 'preference', 'event', 'concern', 'relationship']),
  body('importance').optional().isInt({ min: 0, max: 100 }),
];

// POST /api/call
export const initiateCall = [
  body('phoneNumber').trim().notEmpty().withMessage('phoneNumber is required'),
];

// POST /api/reminders
export const createReminder = [
  body('seniorId').isUUID().withMessage('seniorId must be a valid UUID'),
  body('title').trim().notEmpty().isLength({ max: 255 }).withMessage('Title is required'),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('type').optional().isIn(['medication', 'appointment', 'custom']),
  body('scheduledTime').optional().isISO8601(),
  body('isRecurring').optional().isBoolean(),
  body('cronExpression').optional().isString().isLength({ max: 100 }),
];

// PATCH /api/reminders/:id
export const updateReminder = [
  uuidParam(),
  body('title').optional().trim().isLength({ max: 255 }),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('scheduledTime').optional().isISO8601(),
  body('isRecurring').optional().isBoolean(),
  body('cronExpression').optional().isString().isLength({ max: 100 }),
  body('isActive').optional().isBoolean(),
];

// GET /api/seniors/:id/memories/search
export const searchMemories = [
  uuidParam(),
  query('q').trim().notEmpty().withMessage('Search query is required'),
  query('limit').optional().isInt({ min: 1, max: 50 }),
];
```

**Step 3: Create `middleware/error-handler.js`**

```javascript
import { validationResult } from 'express-validator';

/**
 * Middleware that checks express-validator results.
 * Returns 400 with validation errors if any.
 */
export function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

/**
 * Centralized error handler - goes LAST in middleware chain.
 * Never leaks internal error details to clients.
 */
export function errorHandler(err, req, res, _next) {
  // Log full error internally
  console.error(`[${req.id || 'no-id'}] Unhandled error:`, err);

  // Don't leak internal details
  const status = err.status || err.statusCode || 500;
  const message = status < 500
    ? err.message
    : 'An internal error occurred';

  res.status(status).json({ error: message });
}
```

**Step 4: Commit**

```bash
git add middleware/validation.js middleware/error-handler.js package.json package-lock.json
git commit -m "feat: add input validation and centralized error handling middleware"
```

---

## Task 3: Twilio Webhook Auth + API Key Auth (Agent 3)

**Files:**
- Create: `middleware/twilio-auth.js`
- Create: `middleware/api-auth.js`

**Step 1: Create `middleware/twilio-auth.js`**

Uses Twilio's built-in request validation (no new dependencies):

```javascript
import twilio from 'twilio';

/**
 * Validates that webhook requests actually come from Twilio.
 * Uses Twilio's X-Twilio-Signature header verification.
 * Skipped in development (no RAILWAY_PUBLIC_DOMAIN).
 */
export function validateTwilioWebhook(req, res, next) {
  // Skip validation in local development
  if (!process.env.RAILWAY_PUBLIC_DOMAIN) {
    return next();
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('[Auth] TWILIO_AUTH_TOKEN not set, cannot validate webhook');
    return res.status(500).send('Server configuration error');
  }

  const signature = req.headers['x-twilio-signature'];
  const url = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}${req.originalUrl}`;

  const isValid = twilio.validateRequest(authToken, signature, url, req.body);

  if (!isValid) {
    console.warn(`[Auth] Invalid Twilio signature for ${req.originalUrl}`);
    return res.status(403).send('Forbidden');
  }

  next();
}
```

**Step 2: Create `middleware/api-auth.js`**

Simple API key auth for admin routes (env-var based, no database needed):

```javascript
/**
 * API key authentication middleware.
 * Reads DONNA_API_KEY from environment. If set, all /api/* routes
 * require Authorization: Bearer <key> header.
 * If DONNA_API_KEY is not set, auth is disabled (development mode).
 */
export function requireApiKey(req, res, next) {
  const apiKey = process.env.DONNA_API_KEY;

  // If no API key configured, skip auth (dev mode)
  if (!apiKey) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const token = authHeader.slice(7);

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(token, apiKey)) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return require('crypto').timingSafeEqual(bufA, bufB);
}
```

**Step 3: Commit**

```bash
git add middleware/twilio-auth.js middleware/api-auth.js
git commit -m "feat: add Twilio webhook validation and API key authentication middleware"
```

---

## Task 4: Log Sanitization + PII Protection (Agent 4)

**Files:**
- Create: `lib/logger.js`
- Create: `lib/sanitize.js`
- Modify: `services/seniors.js` (replace console.log)
- Modify: `services/memory.js` (replace console.log)
- Modify: `services/conversations.js` (replace console.log)
- Modify: `services/scheduler.js` (replace console.log)

**Step 1: Create `lib/sanitize.js`**

```javascript
/**
 * PII sanitization utilities.
 * Masks phone numbers, limits content previews, redacts sensitive fields.
 */

/**
 * Mask a phone number: "5551234567" -> "***4567"
 */
export function maskPhone(phone) {
  if (!phone) return '[no-phone]';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return '***' + digits.slice(-4);
}

/**
 * Truncate content for safe logging: "long string..." -> "long str..."
 */
export function truncate(str, maxLen = 30) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

/**
 * Mask a senior name for logs: "David Zuluaga" -> "David Z."
 */
export function maskName(name) {
  if (!name) return '[unknown]';
  const parts = name.split(' ');
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts.slice(1).map(p => p[0] + '.').join(' ');
}
```

**Step 2: Create `lib/logger.js`**

```javascript
import { maskPhone, maskName, truncate } from './sanitize.js';

/**
 * Structured logger that sanitizes PII automatically.
 * Wraps console.log/error/warn with tag-based formatting.
 *
 * Usage:
 *   import { createLogger } from '../lib/logger.js';
 *   const log = createLogger('Memory');
 *   log.info('Stored memory', { seniorId: '...', content: 'long text...' });
 */
export function createLogger(tag) {
  const prefix = `[${tag}]`;

  return {
    info(message, meta = {}) {
      console.log(prefix, message, sanitizeMeta(meta));
    },
    warn(message, meta = {}) {
      console.warn(prefix, message, sanitizeMeta(meta));
    },
    error(message, meta = {}) {
      console.error(prefix, message, sanitizeMeta(meta));
    },
  };
}

/**
 * Auto-sanitize known PII fields in metadata objects.
 */
function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const safe = { ...meta };

  if (safe.phone) safe.phone = maskPhone(safe.phone);
  if (safe.seniorPhone) safe.seniorPhone = maskPhone(safe.seniorPhone);
  if (safe.fromPhone) safe.fromPhone = maskPhone(safe.fromPhone);
  if (safe.name) safe.name = maskName(safe.name);
  if (safe.seniorName) safe.seniorName = maskName(safe.seniorName);
  if (safe.content) safe.content = truncate(safe.content, 50);

  return safe;
}
```

**Step 3: Update `services/seniors.js` - replace console.log with safe logger**

Replace:
```javascript
console.log(`[Senior] Created: ${senior.name} (${senior.phone})`);
```
With:
```javascript
import { createLogger } from '../lib/logger.js';
const log = createLogger('Senior');
// ...
log.info('Created senior', { name: senior.name, phone: senior.phone });
```

**Step 4: Update `services/memory.js` - replace console.log/error with safe logger**

Replace all `console.log('[Memory]'...)` and `console.error('[Memory]'...)` calls.

**Step 5: Update `services/conversations.js` - replace console.log/error with safe logger**

**Step 6: Update `services/scheduler.js` - replace console.log/error with safe logger**

**Step 7: Commit**

```bash
git add lib/logger.js lib/sanitize.js services/seniors.js services/memory.js services/conversations.js services/scheduler.js
git commit -m "feat: add PII-safe logger and sanitize sensitive data in logs"
```

---

## Task 5: Final Integration (Lead - Sequential after Tasks 1-4)

**Files:**
- Modify: `index.js`

Wire all middleware into the Express app, replace raw `error.message` responses:

```javascript
// New imports at top of index.js
import { securityHeaders, requestId } from './middleware/security.js';
import { apiLimiter, callLimiter, webhookLimiter } from './middleware/rate-limit.js';
import { validateTwilioWebhook } from './middleware/twilio-auth.js';
import { requireApiKey } from './middleware/api-auth.js';
import { validate } from './middleware/error-handler.js';
import { errorHandler } from './middleware/error-handler.js';
import * as validators from './middleware/validation.js';

// Before routes:
app.use(requestId());
app.use(securityHeaders());

// Apply API key auth and rate limiting to /api/* routes
app.use('/api', requireApiKey, apiLimiter);

// Apply Twilio auth to webhook routes
app.use('/voice', webhookLimiter, validateTwilioWebhook);

// Apply stricter rate limit to call initiation
app.post('/api/call', callLimiter, validators.initiateCall, validate, ...);

// Apply validators to each route
app.post('/api/seniors', validators.createSenior, validate, ...);
app.patch('/api/seniors/:id', validators.updateSenior, validate, ...);
// ... etc for all routes

// After all routes:
app.use(errorHandler);

// Replace all catch blocks:
// BEFORE: res.status(500).json({ error: error.message });
// AFTER:  next(error);  // Let errorHandler handle it
```

---

## File Conflict Matrix

| File | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Lead |
|------|---------|---------|---------|---------|------|
| `middleware/security.js` | CREATE | | | | |
| `middleware/rate-limit.js` | CREATE | | | | |
| `middleware/validation.js` | | CREATE | | | |
| `middleware/error-handler.js` | | CREATE | | | |
| `middleware/twilio-auth.js` | | | CREATE | | |
| `middleware/api-auth.js` | | | CREATE | | |
| `lib/logger.js` | | | | CREATE | |
| `lib/sanitize.js` | | | | CREATE | |
| `services/seniors.js` | | | | MODIFY | |
| `services/memory.js` | | | | MODIFY | |
| `services/conversations.js` | | | | MODIFY | |
| `services/scheduler.js` | | | | MODIFY | |
| `index.js` | | | | | MODIFY |
| `package.json` | MODIFY | MODIFY | | | |

**Note:** Agents 1 and 2 both modify `package.json` via `npm install`. Agent 1 should install first, then Agent 2. Or both install simultaneously (npm handles lock file merging).

---

*Last updated: February 2026*
