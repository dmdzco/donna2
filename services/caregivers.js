import { db } from '../db/client.js';
import { caregivers, caregiverSeniors, seniors } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export const caregiverService = {
  // Create a new caregiver
  async create(data) {
    const [caregiver] = await db.insert(caregivers).values({
      name: data.name,
      email: data.email.toLowerCase(),
      clerkUserId: data.clerkUserId || null,
    }).returning();

    console.log(`[Caregiver] Created: ${caregiver.name} (${caregiver.email})`);
    return caregiver;
  },

  // Get caregiver by ID
  async getById(id) {
    const [caregiver] = await db.select().from(caregivers)
      .where(eq(caregivers.id, id));
    return caregiver || null;
  },

  // Get caregiver by email
  async getByEmail(email) {
    const [caregiver] = await db.select().from(caregivers)
      .where(eq(caregivers.email, email.toLowerCase()));
    return caregiver || null;
  },

  // Get caregiver by Clerk user ID
  async getByClerkUserId(clerkUserId) {
    const [caregiver] = await db.select().from(caregivers)
      .where(eq(caregivers.clerkUserId, clerkUserId));
    return caregiver || null;
  },

  // Update a caregiver
  async update(id, data) {
    const updateData = { ...data, updatedAt: new Date() };

    if (data.email) {
      updateData.email = data.email.toLowerCase();
    }

    const [caregiver] = await db.update(caregivers)
      .set(updateData)
      .where(eq(caregivers.id, id))
      .returning();

    return caregiver;
  },

  // Link a caregiver to a senior
  async linkSenior(caregiverId, seniorId, relation, isPrimary = true) {
    const [link] = await db.insert(caregiverSeniors).values({
      caregiverId,
      seniorId,
      relation,
      isPrimary,
    }).returning();

    console.log(`[Caregiver] Linked caregiver ${caregiverId} to senior ${seniorId} as ${relation}`);
    return link;
  },

  // Get seniors for a caregiver
  async getSeniorsForCaregiver(caregiverId) {
    const links = await db.select({
      senior: seniors,
      relation: caregiverSeniors.relation,
      isPrimary: caregiverSeniors.isPrimary,
    })
      .from(caregiverSeniors)
      .innerJoin(seniors, eq(caregiverSeniors.seniorId, seniors.id))
      .where(and(
        eq(caregiverSeniors.caregiverId, caregiverId),
        eq(seniors.isActive, true)
      ));

    return links.map(link => ({
      ...link.senior,
      relation: link.relation,
      isPrimary: link.isPrimary,
    }));
  },

  // Get caregivers for a senior
  async getCaregiversForSenior(seniorId) {
    const links = await db.select({
      caregiver: caregivers,
      relation: caregiverSeniors.relation,
      isPrimary: caregiverSeniors.isPrimary,
    })
      .from(caregiverSeniors)
      .innerJoin(caregivers, eq(caregiverSeniors.caregiverId, caregivers.id))
      .where(eq(caregiverSeniors.seniorId, seniorId));

    return links.map(link => ({
      ...link.caregiver,
      relation: link.relation,
      isPrimary: link.isPrimary,
    }));
  },

  // Remove a caregiver-senior link
  async unlinkSenior(caregiverId, seniorId) {
    const result = await db.delete(caregiverSeniors)
      .where(and(
        eq(caregiverSeniors.caregiverId, caregiverId),
        eq(caregiverSeniors.seniorId, seniorId)
      ))
      .returning();

    return result.length > 0;
  },

  // Get or create caregiver by Clerk user ID
  async getOrCreateByClerkUserId(clerkUserId, userData) {
    let caregiver = await this.getByClerkUserId(clerkUserId);

    if (!caregiver) {
      caregiver = await this.create({
        ...userData,
        clerkUserId,
      });
    }

    return caregiver;
  },
};
