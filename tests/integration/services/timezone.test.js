import { describe, expect, it } from 'vitest';
import {
  cronExpressionFromTime,
  parseDailyCronExpression,
  resolveTimezoneFromProfile,
  wallTimeTodayToUtcDate,
} from '../../../lib/timezone.js';

describe('timezone helpers', () => {
  it('resolves a senior timezone from profile city and state', () => {
    expect(resolveTimezoneFromProfile({ city: 'Los Angeles', state: 'CA' }))
      .toBe('America/Los_Angeles');
    expect(resolveTimezoneFromProfile({ city: 'El Paso', state: 'TX' }))
      .toBe('America/Denver');
    expect(resolveTimezoneFromProfile({ city: 'Knoxville', state: 'TN' }))
      .toBe('America/New_York');
  });

  it('prefers an explicit timezone over inferred location', () => {
    expect(resolveTimezoneFromProfile({ timezone: 'America/Chicago' }))
      .toBe('America/Chicago');
    expect(resolveTimezoneFromProfile({
      city: 'Los Angeles',
      state: 'CA',
      timezone: 'America/Chicago',
    })).toBe('America/Chicago');
  });

  it('converts senior wall-clock times to UTC with DST-aware offsets', () => {
    expect(
      wallTimeTodayToUtcDate(
        '9:00 AM',
        'America/Chicago',
        new Date('2026-04-13T16:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-04-13T14:00:00.000Z');

    expect(
      wallTimeTodayToUtcDate(
        '9:00 AM',
        'America/Chicago',
        new Date('2026-01-13T16:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-01-13T15:00:00.000Z');
  });

  it('encodes recurring reminder wall time as a daily cron expression', () => {
    expect(cronExpressionFromTime('2:30 PM')).toBe('30 14 * * *');
    expect(parseDailyCronExpression('30 14 * * *')).toEqual({
      hours: 14,
      minutes: 30,
    });
  });
});
