import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initiateTelnyxOutboundCall: vi.fn(),
  prewarmTelnyxOutboundContext: vi.fn(),
  dbSelect: vi.fn(),
  dbExecute: vi.fn(),
  dbUpdate: vi.fn(),
  runDailyPrefetch: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../services/telnyx.js', () => ({
  initiateTelnyxOutboundCall: mocks.initiateTelnyxOutboundCall,
  prewarmTelnyxOutboundContext: mocks.prewarmTelnyxOutboundContext,
}));

vi.mock('../../db/client.js', () => ({
  db: {
    select: mocks.dbSelect,
    execute: mocks.dbExecute,
    update: mocks.dbUpdate,
  },
}));

vi.mock('../../services/context-cache.js', () => ({
  contextCacheService: {
    runDailyPrefetch: mocks.runDailyPrefetch,
  },
}));

vi.mock('../../services/data-retention.js', () => ({
  runDailyPurgeIfNeeded: vi.fn(),
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => mocks.logger,
}));

vi.mock('../../lib/growthbook.js', () => ({
  resolveFlags: vi.fn(async () => ({})),
  getValue: vi.fn(),
}));

const { schedulerService } = await import('../../services/scheduler.js');

function buildReminderSpec() {
  const scheduledFor = new Date(Date.now() + 5 * 60 * 1000);
  return {
    type: 'reminder',
    senior: {
      id: 'senior-1',
      timezone: 'America/New_York',
    },
    reminder: {
      id: 'reminder-1',
      scheduledTime: scheduledFor.toISOString(),
      isRecurring: false,
    },
    scheduledFor,
  };
}

function buildPrewarmedContext(spec, overrides = {}) {
  const warmedAt = new Date(Date.now());
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  return {
    version: 1,
    seniorId: spec.senior.id,
    callType: 'reminder',
    reminderId: spec.reminder.id,
    scheduledFor: spec.scheduledFor.toISOString(),
    warmedAt: warmedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    contextSeedSource: 'context_cache',
    hydratedContext: {
      memoryContext: 'Warm memory',
      preGeneratedGreeting: 'Hi there',
      newsContext: 'Fresh news',
      recentTurns: 'Recent turns',
      previousCallsSummary: 'Previous summary',
      todaysContext: 'Today',
      lastCallAnalysis: { summary: 'Yesterday' },
      callSettings: { preferred_call_window: 'morning' },
      caregiverNotesContent: [],
    },
    ...overrides,
  };
}

function makeSelectBuilder(result) {
  const builder = {
    from: vi.fn(() => builder),
    innerJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(Array.isArray(result) ? result : [])),
    then: (resolve, reject) => Promise.resolve(Array.isArray(result) ? result : []).then(resolve, reject),
  };
  return builder;
}

describe('schedulerService reminder prewarm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    schedulerService.clearReminderPrewarmCache();
    mocks.initiateTelnyxOutboundCall.mockResolvedValue({
      callSid: 'v3:test-call',
      callControlId: 'v3:test-call',
    });
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('10');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    schedulerService.clearReminderPrewarmCache();
  });

  it('caches a usable reminder prewarm payload', async () => {
    const spec = buildReminderSpec();
    mocks.prewarmTelnyxOutboundContext.mockResolvedValue({
      success: true,
      prewarmedContext: buildPrewarmedContext(spec),
    });

    const summary = await schedulerService.prewarmReminderCalls([spec], 'https://pipecat.example.test');

    expect(summary).toEqual({
      attempted: 1,
      warmed: 1,
      cacheHits: 0,
      failed: 0,
    });
    expect(schedulerService.getReminderPrewarm(spec)).toEqual(
      expect.objectContaining({
        seniorId: 'senior-1',
        reminderId: 'reminder-1',
      }),
    );
  });

  it('reuses prewarmed reminder context on the outbound call request', async () => {
    const spec = buildReminderSpec();
    mocks.prewarmTelnyxOutboundContext.mockResolvedValue({
      success: true,
      prewarmedContext: buildPrewarmedContext(spec),
    });

    await schedulerService.prewarmReminderCalls([spec], 'https://pipecat.example.test');
    await schedulerService.triggerOutboundCall(spec, 'https://pipecat.example.test');

    expect(mocks.initiateTelnyxOutboundCall).toHaveBeenCalledWith(
      expect.objectContaining({
        seniorId: 'senior-1',
        callType: 'reminder',
        reminderId: 'reminder-1',
        prewarmedContext: expect.objectContaining({
          seniorId: 'senior-1',
          reminderId: 'reminder-1',
        }),
        baseUrl: 'https://pipecat.example.test',
      }),
    );
    expect(schedulerService.getReminderPrewarm(spec)).toBeNull();
  });

  it('falls back to live hydration when the cached prewarm is expired', async () => {
    const spec = buildReminderSpec();
    mocks.prewarmTelnyxOutboundContext.mockResolvedValue({
      success: true,
      prewarmedContext: buildPrewarmedContext(spec, {
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
      }),
    });

    const summary = await schedulerService.prewarmReminderCalls([spec], 'https://pipecat.example.test');
    await schedulerService.triggerOutboundCall(spec, 'https://pipecat.example.test');

    expect(summary.failed).toBe(1);
    expect(mocks.initiateTelnyxOutboundCall.mock.calls[0][0].prewarmedContext).toBeUndefined();
  });
});

describe('schedulerService reminder reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    schedulerService.clearReminderPrewarmCache();
    mocks.initiateTelnyxOutboundCall.mockResolvedValue({
      callSid: 'v3:test-call',
      callControlId: 'v3:test-call',
    });
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('10');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    schedulerService.clearReminderPrewarmCache();
  });

  it('deduplicates welfare calls when a senior already has a reminder call planned', () => {
    const reminderSpec = {
      reminder: { id: 'reminder-1' },
      senior: { id: 'senior-1' },
      scheduledFor: new Date('2035-01-01T15:00:00.000Z'),
    };
    const specs = schedulerService.buildCallPlan(
      [reminderSpec],
      [
        { id: 'senior-1' },
        { id: 'senior-2' },
      ],
    );

    expect(specs).toEqual([
      expect.objectContaining({
        type: 'reminder',
        senior: { id: 'senior-1' },
      }),
      expect.objectContaining({
        type: 'welfare',
        senior: { id: 'senior-2' },
      }),
    ]);
  });

  it('skips due reminders that already have completed or pending deliveries', async () => {
    const now = new Date('2035-01-01T15:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const dueReminder = {
      id: 'reminder-1',
      seniorId: 'senior-1',
      scheduledTime: now.toISOString(),
      isRecurring: false,
      isActive: true,
    };
    const senior = {
      id: 'senior-1',
      isActive: true,
      timezone: 'America/New_York',
    };

    const queryResults = [
      [{ reminder: dueReminder, senior }],
      [],
      [],
    ];
    mocks.dbSelect.mockImplementation(() => makeSelectBuilder(queryResults.shift() ?? []));
    vi.spyOn(schedulerService, '_findReminderDeliveryByStatuses')
      .mockResolvedValueOnce({ id: 'delivery-completed', status: 'acknowledged' });

    const due = await schedulerService.getDueReminders();

    expect(due).toEqual([]);
    expect(schedulerService._findReminderDeliveryByStatuses).toHaveBeenCalledWith(
      'reminder-1',
      expect.any(Date),
      ['acknowledged', 'confirmed', 'max_attempts'],
    );
    expect(mocks.dbSelect).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('retries transient Telnyx failures before reporting a reminder call as initiated', async () => {
    const spec = buildReminderSpec();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
      callback();
      return 0;
    });
    mocks.initiateTelnyxOutboundCall
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({
        callSid: 'v3:retry-success',
        callControlId: 'v3:retry-success',
      });

    const result = await schedulerService.triggerOutboundCall(spec, 'https://pipecat.example.test');

    expect(result).toEqual({
      sid: 'v3:retry-success',
      callSid: 'v3:retry-success',
      callControlId: 'v3:retry-success',
    });
    expect(mocks.initiateTelnyxOutboundCall).toHaveBeenCalledTimes(3);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      'Telnyx call retry',
      expect.objectContaining({ attempt: 1, delay_ms: 1000 }),
    );
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      'Telnyx call retry',
      expect.objectContaining({ attempt: 2, delay_ms: 2000 }),
    );
    setTimeoutSpy.mockRestore();
  });

  it('keeps recurring reminders pinned to senior wall-clock time across DST', () => {
    const reminder = {
      scheduledTime: '2035-03-11T14:30:00.000Z',
      isRecurring: true,
      cronExpression: '30 9 * * *',
    };
    const senior = {
      id: 'senior-1',
      timezone: 'America/New_York',
    };

    expect(
      schedulerService
        .getScheduledForTime(reminder, senior, new Date('2035-03-11T12:00:00.000Z'))
        .toISOString(),
    ).toBe('2035-03-11T13:30:00.000Z');
  });
});
