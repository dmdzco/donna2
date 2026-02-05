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
