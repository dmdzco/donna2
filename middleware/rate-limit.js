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
