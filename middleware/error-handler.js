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
