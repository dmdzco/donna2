import { Router } from 'express';
import { db } from '../db/client.js';
import { waitlist } from '../db/schema.js';
import { routeError } from './helpers.js';

const router = Router();

// Ensure table exists on first request
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      who_for VARCHAR(100),
      thoughts TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  tableReady = true;
}

// Public endpoint — no API key required (mounted outside /api prefix)
router.post('/waitlist', async (req, res) => {
  try {
    const { name, email, phone, whoFor, thoughts } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    await ensureTable();
    await db.insert(waitlist).values({
      name,
      email,
      phone: phone || null,
      whoFor: whoFor || null,
      thoughts: thoughts || null,
    });

    res.json({ success: true });
  } catch (error) {
    routeError(res, error, 'POST /waitlist');
  }
});

export default router;
