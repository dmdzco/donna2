/**
 * Clerk Authentication Middleware
 */

import { clerkClient, requireAuth, getAuth } from '@clerk/express';

export const requireClerkAuth = requireAuth();

export const optionalClerkAuth = (req, res, next) => {
  try {
    const auth = getAuth(req);
    req.auth = auth;
  } catch {
    req.auth = null;
  }
  next();
};

export const getClerkUserId = (req) => {
  const auth = getAuth(req);
  return auth?.userId || null;
};

export { clerkClient, getAuth };
