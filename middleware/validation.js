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
