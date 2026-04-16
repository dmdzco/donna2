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
