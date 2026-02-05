import 'dotenv/config';
import { db } from '../db/client.js';
import { adminUsers } from '../db/schema.js';
import bcrypt from 'bcrypt';

const email = process.argv[2];
const password = process.argv[3];
const name = process.argv[4] || 'Admin';

if (!email || !password) {
  console.error('Usage: node scripts/create-admin.js <email> <password> [name]');
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 12);

const [admin] = await db.insert(adminUsers).values({
  email,
  passwordHash,
  name,
}).returning();

console.log(`Admin created: ${admin.email} (${admin.id})`);
process.exit(0);
