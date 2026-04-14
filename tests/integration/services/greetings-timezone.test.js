import { afterEach, describe, expect, it, vi } from 'vitest';
import { greetingService } from '../../../services/greetings.js';

describe('greeting timezone fallback', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back to New York local time for invalid profile timezones', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));

    expect(greetingService.getLocalHour('Invalid/Timezone')).toBe(8);
  });
});
