import { describe, expect, it } from 'vitest';
import {
  getReminderWallTime,
  getScheduledForTimeInTimezone,
} from '../../../services/scheduler.js';

describe('scheduler timezone handling', () => {
  it('uses recurring reminder cron time as the senior wall-clock time', () => {
    const senior = { city: 'Los Angeles', state: 'CA', timezone: 'America/New_York' };
    const reminder = {
      scheduledTime: '2026-04-13T13:00:00.000Z',
      isRecurring: true,
      cronExpression: '30 14 * * *',
    };

    expect(getReminderWallTime(reminder, senior)).toEqual({
      hours: 14,
      minutes: 30,
    });
    expect(
      getScheduledForTimeInTimezone(
        reminder,
        senior,
        new Date('2026-04-13T18:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-04-13T18:30:00.000Z');
  });
});
