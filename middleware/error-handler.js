/**
 * Centralized error handler - goes LAST in middleware chain.
 * Never leaks internal error details to clients.
 */
import { logRouteError, sendError } from '../lib/http-response.js';

export function errorHandler(err, req, res, _next) {
  // Don't leak internal details
  const status = err.status || err.statusCode || 500;
  const message = status < 500
    ? err.message
    : 'An internal error occurred';

  logRouteError('Unhandled middleware error', err, req, status);
  sendError(res, status, { error: message });
}
