import { describe, expect, it } from 'vitest';
import {
  ENCRYPTED_PLACEHOLDER,
  decryptDailyContextPhi,
  decryptNotificationPhi,
  decryptReminderPhi,
  decryptSeniorPhi,
  encryptDailyContextPhi,
  encryptNotificationPhi,
  encryptReminderPhi,
  encryptSeniorPhi,
  encryptWaitlistPhi,
} from '../../../lib/phi.js';

describe('PHI encryption helpers', () => {
  it('moves senior profile PHI into encrypted companion fields', () => {
    const encrypted = encryptSeniorPhi({
      name: 'Margaret',
      familyInfo: { relation: 'mother' },
      medicalNotes: 'Blood pressure medication',
      preferredCallTimes: { schedule: { time: '10:00' }, topicsToAvoid: ['politics'] },
      additionalInfo: 'Likes reminders after breakfast',
    });

    expect(encrypted.familyInfo).toBeNull();
    expect(encrypted.medicalNotes).toBeNull();
    expect(encrypted.preferredCallTimes).toBeNull();
    expect(encrypted.additionalInfo).toBeNull();
    expect(encrypted.familyInfoEncrypted).toBeTruthy();
    expect(encrypted.medicalNotesEncrypted).toBeTruthy();
    expect(encrypted.preferredCallTimesEncrypted).toBeTruthy();
    expect(encrypted.additionalInfoEncrypted).toBeTruthy();

    const decrypted = decryptSeniorPhi(encrypted);
    expect(decrypted.familyInfo).toEqual({ relation: 'mother' });
    expect(decrypted.medicalNotes).toBe('Blood pressure medication');
    expect(decrypted.preferredCallTimes.topicsToAvoid).toEqual(['politics']);
    expect(decrypted.additionalInfo).toBe('Likes reminders after breakfast');
    expect(decrypted).not.toHaveProperty('medicalNotesEncrypted');
  });

  it('moves reminders and notifications out of plaintext fields', () => {
    const reminder = encryptReminderPhi({
      title: 'Take metformin',
      description: '500mg with dinner',
    });
    expect(reminder.title).toBe(ENCRYPTED_PLACEHOLDER);
    expect(reminder.description).toBeNull();
    expect(decryptReminderPhi(reminder)).toMatchObject({
      title: 'Take metformin',
      description: '500mg with dinner',
    });

    const notification = encryptNotificationPhi({
      content: 'Donna noticed a missed medication reminder.',
      metadata: { severity: 'medium' },
    });
    expect(notification.content).toBe(ENCRYPTED_PLACEHOLDER);
    expect(notification.metadata).toBeNull();
    expect(decryptNotificationPhi(notification)).toMatchObject({
      content: 'Donna noticed a missed medication reminder.',
      metadata: { severity: 'medium' },
    });
  });

  it('stores daily context and waitlist payloads as encrypted blobs', () => {
    const daily = encryptDailyContextPhi({
      topicsDiscussed: ['sleep'],
      remindersDelivered: ['Take metformin'],
      adviceGiven: ['Drink water'],
      keyMoments: [{ type: 'mood', value: 'tired' }],
      summary: 'Senior sounded tired.',
    });
    expect(daily.topicsDiscussed).toBeNull();
    expect(daily.remindersDelivered).toBeNull();
    expect(daily.adviceGiven).toBeNull();
    expect(daily.keyMoments).toBeNull();
    expect(daily.summary).toBeNull();
    expect(decryptDailyContextPhi(daily)).toMatchObject({
      topicsDiscussed: ['sleep'],
      remindersDelivered: ['Take metformin'],
      adviceGiven: ['Drink water'],
      keyMoments: [{ type: 'mood', value: 'tired' }],
      summary: 'Senior sounded tired.',
    });

    const waitlist = encryptWaitlistPhi({
      name: 'Ana',
      email: 'ana@example.com',
      phone: '5551234567',
      whoFor: 'mom',
      thoughts: 'Needs companionship',
    });
    expect(waitlist.name).toBe(ENCRYPTED_PLACEHOLDER);
    expect(waitlist.email).toBe(ENCRYPTED_PLACEHOLDER);
    expect(waitlist.phone).toBeNull();
    expect(waitlist.payloadEncrypted).toBeTruthy();
  });
});
