/**
 * Rate Limiting Middleware
 *
 * Protects against DoS attacks, API abuse, and runaway costs.
 * Uses express-rate-limit with different limits for different endpoints.
 */

import rateLimit from 'express-rate-limit';

/**
 * Standard error response for rate limiting
 */
const rateLimitHandler = (req, res) => {
  res.status(429).json({
    error: 'Too many requests',
    message: 'Please slow down and try again later',
    retryAfter: res.getHeader('Retry-After'),
  });
};

/**
 * Global API rate limiter
 * 100 requests per minute per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
});

/**
 * Strict rate limiter for call initiation
 * 5 calls per minute per IP (prevents spam calls and cost abuse)
 */
export const callLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many calls initiated',
    message: 'Maximum 5 calls per minute. Please wait before initiating more calls.',
  },
  handler: rateLimitHandler,
});

/**
 * Strict rate limiter for write operations (create/update/delete)
 * 30 requests per minute per IP
 */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/**
 * Auth endpoint limiter (for future Clerk integration)
 * 10 requests per minute per IP
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts',
    message: 'Please wait before trying again.',
  },
  handler: rateLimitHandler,
});

export default {
  apiLimiter,
  callLimiter,
  writeLimiter,
  authLimiter,
};
