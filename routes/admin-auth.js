import { Router } from 'express';
import { db } from '../db/client.js';
import { adminUsers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'donna-admin-secret-change-me';

// Login - no auth required
router.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const [admin] = await db.select().from(adminUsers)
      .where(eq(adminUsers.email, email.toLowerCase().trim()));

    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await db.update(adminUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(adminUsers.id, admin.id));

    const token = jwt.sign(
      { adminId: admin.id, email: admin.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name },
    });
  } catch (error) {
    console.error('[Admin Auth] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current admin - requires valid JWT
router.get('/api/admin/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    const [admin] = await db.select({
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      lastLoginAt: adminUsers.lastLoginAt,
    }).from(adminUsers)
      .where(eq(adminUsers.id, decoded.adminId));

    if (!admin) {
      return res.status(401).json({ error: 'Admin not found' });
    }

    res.json(admin);
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    res.status(500).json({ error: 'Auth check failed' });
  }
});

export default router;
