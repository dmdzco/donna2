import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../db/client.js';
import { AppError } from '../middleware/error-handler.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Register new caregiver
authRouter.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, phone } = registerSchema.parse(req.body);

    // Check if email exists
    const existing = await db.query(
      'SELECT id FROM caregivers WHERE email = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      throw new AppError(400, 'Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create caregiver
    const result = await db.query(
      `INSERT INTO caregivers (email, password_hash, name, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, phone, created_at`,
      [email, passwordHash, name, phone]
    );

    const caregiver = result.rows[0];

    // Generate token
    const token = jwt.sign(
      { caregiverId: caregiver.id },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'] }
    );

    res.status(201).json({
      token,
      caregiver: {
        id: caregiver.id,
        email: caregiver.email,
        name: caregiver.name,
        phone: caregiver.phone,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Login
authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const result = await db.query(
      'SELECT id, email, password_hash, name, phone FROM caregivers WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      throw new AppError(401, 'Invalid email or password');
    }

    const caregiver = result.rows[0];
    const isValid = await bcrypt.compare(password, caregiver.password_hash);

    if (!isValid) {
      throw new AppError(401, 'Invalid email or password');
    }

    const token = jwt.sign(
      { caregiverId: caregiver.id },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'] }
    );

    res.json({
      token,
      caregiver: {
        id: caregiver.id,
        email: caregiver.email,
        name: caregiver.name,
        phone: caregiver.phone,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get current user
authRouter.get('/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, phone, created_at FROM caregivers WHERE id = $1',
      [req.caregiverId]
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Caregiver not found');
    }

    res.json({ caregiver: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
