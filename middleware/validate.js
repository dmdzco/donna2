/**
 * Validation Middleware
 *
 * Provides reusable Express middleware for Zod schema validation.
 * Handles body, query, and params validation with standardized error responses.
 */

import { ZodError } from 'zod';

/**
 * Format Zod errors into a user-friendly structure
 */
function formatZodErrors(error) {
  // Zod v4 uses .issues instead of .errors
  const issues = error?.issues || error?.errors;
  if (!issues || !Array.isArray(issues)) {
    return [{ field: 'unknown', message: error?.message || 'Validation failed', code: 'unknown' }];
  }
  return issues.map(err => ({
    field: err.path.join('.') || 'body',
    message: err.message,
    code: err.code,
  }));
}

/**
 * Create validation middleware for request body
 *
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @returns {import('express').RequestHandler}
 */
export function validateBody(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated; // Replace with validated/transformed data
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: formatZodErrors(error),
        });
      }
      next(error);
    }
  };
}

/**
 * Create validation middleware for URL parameters
 *
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @returns {import('express').RequestHandler}
 */
export function validateParams(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Invalid URL parameters',
          details: formatZodErrors(error),
        });
      }
      next(error);
    }
  };
}

/**
 * Create validation middleware for query parameters
 *
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @returns {import('express').RequestHandler}
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: formatZodErrors(error),
        });
      }
      next(error);
    }
  };
}

/**
 * Combined validation for body and params
 *
 * @param {Object} schemas - Object with bodySchema and/or paramsSchema
 * @returns {import('express').RequestHandler}
 */
export function validate({ body: bodySchema, params: paramsSchema, query: querySchema }) {
  return (req, res, next) => {
    const errors = [];

    if (paramsSchema) {
      try {
        req.params = paramsSchema.parse(req.params);
      } catch (error) {
        if (error instanceof ZodError) {
          // Zod v4 uses .issues instead of .errors
          const issues = error.issues || error.errors || [];
          errors.push(...issues.map(e => ({
            location: 'params',
            field: e.path.join('.'),
            message: e.message,
          })));
        }
      }
    }

    if (querySchema) {
      try {
        req.query = querySchema.parse(req.query);
      } catch (error) {
        if (error instanceof ZodError) {
          const issues = error.issues || error.errors || [];
          errors.push(...issues.map(e => ({
            location: 'query',
            field: e.path.join('.'),
            message: e.message,
          })));
        }
      }
    }

    if (bodySchema) {
      try {
        req.body = bodySchema.parse(req.body);
      } catch (error) {
        if (error instanceof ZodError) {
          const issues = error.issues || error.errors || [];
          errors.push(...issues.map(e => ({
            location: 'body',
            field: e.path.join('.'),
            message: e.message,
          })));
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }

    next();
  };
}

export default {
  validateBody,
  validateParams,
  validateQuery,
  validate,
};
