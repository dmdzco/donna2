/**
 * Centralized error handler - goes LAST in middleware chain.
 * Never leaks internal error details to clients.
 */
import { createLogger } from '../lib/logger.js';

const log = createLogger('UnhandledError');

export function errorHandler(err, req, res, _next) {
  // Log full error internally
  log.error('Unhandled error', { requestId: req.id || 'no-id', error: err });

  // Don't leak internal details
  const status = err.status || err.statusCode || 500;
  const message = status < 500
    ? err.message
    : 'An internal error occurred';

  res.status(status).json({ error: message });
}
