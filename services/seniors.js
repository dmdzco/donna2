import { db } from '../db/client.js';
import { seniors } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const seniorService = {
  // Find senior by phone number
  async findByPhone(phone) {
    // Normalize phone - keep last 10 digits
    const normalized = phone.replace(/\D/g, '').slice(-10);

    const [senior] = await db.select().from(seniors)
      .where(eq(seniors.phone, normalized));

    return senior || null;
  },

  // Create a new senior
  async create(data) {
    const [senior] = await db.insert(seniors).values({
      ...data,
      phone: data.phone.replace(/\D/g, '').slice(-10),
    }).returning();

    console.log(`[Senior] Created: ${senior.name} (${senior.phone})`);
    return senior;
  },

  // Update a senior
  async update(id, data) {
    const updateData = { ...data, updatedAt: new Date() };

    if (data.phone) {
      updateData.phone = data.phone.replace(/\D/g, '').slice(-10);
    }

    const [senior] = await db.update(seniors)
      .set(updateData)
      .where(eq(seniors.id, id))
      .returning();

    return senior;
  },

  // List all active seniors
  async list() {
    return db.select().from(seniors)
      .where(eq(seniors.isActive, true));
  },

  // Get senior by ID
  async getById(id) {
    const [senior] = await db.select().from(seniors)
      .where(eq(seniors.id, id));
    return senior || null;
  },

  // Delete (soft) a senior
  async delete(id) {
    const [senior] = await db.update(seniors)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(seniors.id, id))
      .returning();
    return senior;
  }
};
