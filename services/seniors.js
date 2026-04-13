import { db } from '../db/client.js';
import { seniors, conversations, memories, reminders, reminderDeliveries, caregivers, callAnalyses, dailyCallContext, notificationPreferences, notifications, dataDeletionLogs } from '../db/schema.js';
import { eq, sql, inArray } from 'drizzle-orm';
import { createLogger } from '../lib/logger.js';
import { maskName, maskPhone } from '../lib/sanitize.js';
import { resolveTimezoneFromProfile } from '../lib/timezone.js';

const log = createLogger('Senior');

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
    try {
      const [senior] = await db.insert(seniors).values({
        ...data,
        phone: data.phone.replace(/\D/g, '').slice(-10),
        timezone: resolveTimezoneFromProfile(data),
      }).returning();

      log.info('Created senior', { name: maskName(senior.name), phone: maskPhone(senior.phone) });
      return senior;
    } catch (error) {
      if (error.code === '23505' && error.constraint?.includes('phone')) {
        const err = new Error('This phone number is already registered for another senior');
        err.status = 409;
        throw err;
      }
      throw error;
    }
  },

  // Update a senior
  async update(id, data) {
    const updateData = { ...data, updatedAt: new Date() };

    if (data.phone) {
      updateData.phone = data.phone.replace(/\D/g, '').slice(-10);
    }

    if (
      data.timezone !== undefined ||
      data.city !== undefined ||
      data.state !== undefined ||
      data.zipCode !== undefined
    ) {
      const [existing] = await db.select({
        timezone: seniors.timezone,
        city: seniors.city,
        state: seniors.state,
        zipCode: seniors.zipCode,
      }).from(seniors).where(eq(seniors.id, id)).limit(1);

      updateData.timezone = resolveTimezoneFromProfile({
        ...(existing || {}),
        ...data,
      });
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

  // Deactivate (soft delete) a senior
  async delete(id) {
    const [senior] = await db.update(seniors)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(seniors.id, id))
      .returning();
    return senior;
  },

  // Hard-delete a senior and ALL associated data
  async hardDelete(id, deletedBy, reason = 'user_request') {
    const counts = {};

    // Use a transaction for atomicity
    await db.transaction(async (tx) => {
      // 1. Count records per table for audit log
      const [npCount] = await tx.select({ count: sql`COUNT(*)::int` })
        .from(notificationPreferences)
        .where(inArray(notificationPreferences.caregiverId,
          tx.select({ id: caregivers.id }).from(caregivers).where(eq(caregivers.seniorId, id))
        ));
      counts.notification_preferences = npCount?.count || 0;

      // Count notifications via BOTH FK paths: senior_id and caregiver_id
      const notifResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS count FROM notifications
        WHERE senior_id = ${id}
           OR caregiver_id IN (SELECT id FROM caregivers WHERE senior_id = ${id})
      `);
      counts.notifications = notifResult.rows?.[0]?.count || 0;

      const [cgCount] = await tx.select({ count: sql`COUNT(*)::int` })
        .from(caregivers).where(eq(caregivers.seniorId, id));
      counts.caregivers = cgCount?.count || 0;

      const [rdCount] = await tx.select({ count: sql`COUNT(*)::int` })
        .from(reminderDeliveries)
        .where(inArray(reminderDeliveries.reminderId,
          tx.select({ id: reminders.id }).from(reminders).where(eq(reminders.seniorId, id))
        ));
      counts.reminder_deliveries = rdCount?.count || 0;

      const [remCount] = await tx.select({ count: sql`COUNT(*)::int` })
        .from(reminders).where(eq(reminders.seniorId, id));
      counts.reminders = remCount?.count || 0;

      const [dccCount] = await tx.select({ count: sql`COUNT(*)::int` })
        .from(dailyCallContext).where(eq(dailyCallContext.seniorId, id));
      counts.daily_call_context = dccCount?.count || 0;

      const [caCount] = await tx.select({ count: sql`COUNT(*)::int` })
        .from(callAnalyses).where(eq(callAnalyses.seniorId, id));
      counts.call_analyses = caCount?.count || 0;

      const [memCount] = await tx.select({ count: sql`COUNT(*)::int` })
        .from(memories).where(eq(memories.seniorId, id));
      counts.memories = memCount?.count || 0;

      const [convCount] = await tx.select({ count: sql`COUNT(*)::int` })
        .from(conversations).where(eq(conversations.seniorId, id));
      counts.conversations = convCount?.count || 0;

      // call_metrics and caregiver_notes not in Drizzle schema — use raw SQL
      const [cmCount] = (await tx.execute(sql`SELECT COUNT(*)::int AS count FROM call_metrics WHERE senior_id = ${id}`)).rows;
      counts.call_metrics = cmCount?.count || 0;

      const [cnCount] = (await tx.execute(sql`SELECT COUNT(*)::int AS count FROM caregiver_notes WHERE senior_id = ${id}`)).rows;
      counts.caregiver_notes = cnCount?.count || 0;

      // 2. DELETE in dependency order (deepest children first)
      await tx.delete(notificationPreferences)
        .where(inArray(notificationPreferences.caregiverId,
          tx.select({ id: caregivers.id }).from(caregivers).where(eq(caregivers.seniorId, id))
        ));
      // Delete notifications via BOTH FK paths: senior_id and caregiver_id
      await tx.execute(sql`
        DELETE FROM notifications
        WHERE senior_id = ${id}
           OR caregiver_id IN (SELECT id FROM caregivers WHERE senior_id = ${id})
      `);
      await tx.execute(sql`DELETE FROM caregiver_notes WHERE senior_id = ${id}`);
      await tx.delete(caregivers).where(eq(caregivers.seniorId, id));
      await tx.delete(reminderDeliveries)
        .where(inArray(reminderDeliveries.reminderId,
          tx.select({ id: reminders.id }).from(reminders).where(eq(reminders.seniorId, id))
        ));
      await tx.delete(reminders).where(eq(reminders.seniorId, id));
      await tx.delete(dailyCallContext).where(eq(dailyCallContext.seniorId, id));
      await tx.delete(callAnalyses).where(eq(callAnalyses.seniorId, id));
      await tx.execute(sql`DELETE FROM call_metrics WHERE senior_id = ${id}`);
      await tx.delete(memories).where(eq(memories.seniorId, id));
      await tx.delete(conversations).where(eq(conversations.seniorId, id));

      // 3. Unlink prospects
      await tx.execute(sql`UPDATE prospects SET converted_senior_id = NULL WHERE converted_senior_id = ${id}`);

      // 4. Delete senior
      const delResult = await tx.execute(sql`DELETE FROM seniors WHERE id = ${id}`);
      counts.seniors = delResult.rowCount || 0;

      // 5. Audit log
      await tx.insert(dataDeletionLogs).values({
        entityType: 'senior',
        entityId: id,
        deletionType: 'hard_delete',
        reason,
        deletedBy,
        recordCounts: counts,
      });
    });

    log.info('Hard-deleted senior', { seniorId: id.slice(0, 8), counts });
    return counts;
  }
};
