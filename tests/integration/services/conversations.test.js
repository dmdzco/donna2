import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const updateReturning = vi.fn(async () => [{ id: 'conversation-1' }]);
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));
  const state = { selectRows: [] };
  const limit = vi.fn(async () => state.selectRows);
  const orderBy = vi.fn(() => ({ limit }));
  const selectWhere = vi.fn(() => ({ orderBy }));
  const leftJoin = vi.fn(() => ({ where: selectWhere, orderBy }));
  const from = vi.fn(() => ({ where: selectWhere, leftJoin, orderBy }));
  const select = vi.fn(() => ({ from }));

  return {
    state,
    update,
    set,
    updateWhere,
    updateReturning,
    select,
    from,
    selectWhere,
    leftJoin,
    orderBy,
    limit,
  };
});

const analysisMocks = vi.hoisted(() => ({
  getLatestByConversationIds: vi.fn(async () => new Map()),
}));

vi.mock('../../../db/client.js', () => ({
  db: {
    update: dbMocks.update,
    select: dbMocks.select,
  },
}));

vi.mock('../../../services/call-analyses.js', () => ({
  callAnalysisService: {
    getLatestByConversationIds: analysisMocks.getLatestByConversationIds,
  },
}));

import { conversationService, formatTranscriptText } from '../../../services/conversations.js';

describe('conversation transcript text formatting', () => {
  it('formats structured turns as speaker-labeled text', () => {
    const transcript = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Hi there' },
    ];

    expect(formatTranscriptText(transcript)).toBe('Senior: hello\nDonna: Hi there');
  });

  it('filters ephemeral guidance from text transcripts', () => {
    const transcript = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '[EPHEMERAL: internal guidance]' },
    ];

    expect(formatTranscriptText(transcript)).toBe('Senior: hello');
  });

  it('accepts already formatted text', () => {
    const transcript = 'Senior: hello\nDonna: Hi there';

    expect(formatTranscriptText(transcript)).toBe(transcript);
  });
});

describe('conversation completion transcript storage', () => {
  beforeEach(() => {
    dbMocks.update.mockClear();
    dbMocks.set.mockClear();
    dbMocks.updateWhere.mockClear();
    dbMocks.updateReturning.mockClear();
  });

  it('writes encrypted transcript fields without writing legacy plaintext transcript', async () => {
    const transcript = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Hi there' },
    ];

    await conversationService.complete('CA-1', {
      durationSeconds: 10,
      transcript,
      summary: 'Synthetic summary',
    });

    const setArg = dbMocks.set.mock.calls[0][0];
    expect(setArg).not.toHaveProperty('transcript');
    expect(setArg.transcriptEncrypted).toBe(JSON.stringify(transcript));
    expect(setArg.transcriptTextEncrypted).toBe('Senior: hello\nDonna: Hi there');
  });
});

describe('caregiver call summaries', () => {
  beforeEach(() => {
    dbMocks.state.selectRows = [];
    dbMocks.select.mockClear();
    dbMocks.from.mockClear();
    dbMocks.selectWhere.mockClear();
    dbMocks.leftJoin.mockClear();
    dbMocks.orderBy.mockClear();
    dbMocks.limit.mockClear();
    analysisMocks.getLatestByConversationIds.mockReset();
    analysisMocks.getLatestByConversationIds.mockResolvedValue(new Map());
  });

  it('selects and returns summary-only records for a senior', async () => {
    dbMocks.state.selectRows = [{
      id: 'conversation-1',
      seniorId: 'senior-1',
      startedAt: new Date('2026-04-14T10:00:00Z'),
      endedAt: new Date('2026-04-14T10:05:00Z'),
      durationSeconds: 300,
      status: 'completed',
      summary: 'Synthetic summary',
      summaryEncrypted: null,
      sentiment: 'positive',
      transcript: [{ role: 'user', content: 'should not leak' }],
      transcriptEncrypted: 'enc:should-not-leak',
      transcriptTextEncrypted: 'enc:should-not-leak',
    }];

    const calls = await conversationService.getCallSummariesForSenior('senior-1', 20);

    const selectedFields = Object.keys(dbMocks.select.mock.calls[0][0]);
    expect(selectedFields).toContain('summaryEncrypted');
    expect(selectedFields).not.toContain('transcript');
    expect(selectedFields).not.toContain('transcriptEncrypted');
    expect(selectedFields).not.toContain('transcriptTextEncrypted');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      id: 'conversation-1',
      seniorId: 'senior-1',
      durationSeconds: 300,
      status: 'completed',
      summary: 'Synthetic summary',
      sentiment: 'positive',
    });
    expect(calls[0]).not.toHaveProperty('transcript');
    expect(calls[0]).not.toHaveProperty('transcriptEncrypted');
    expect(calls[0]).not.toHaveProperty('transcriptTextEncrypted');
  });

  it('falls back to the latest call analysis summary without returning analysis details', async () => {
    dbMocks.state.selectRows = [{
      id: 'conversation-1',
      seniorId: 'senior-1',
      startedAt: new Date('2026-04-14T10:00:00Z'),
      endedAt: null,
      durationSeconds: null,
      status: 'completed',
      summary: null,
      summaryEncrypted: null,
      sentiment: null,
    }];
    analysisMocks.getLatestByConversationIds.mockResolvedValue(new Map([
      ['conversation-1', { summary: 'Analysis fallback summary', topics: ['private topic'] }],
    ]));

    const calls = await conversationService.getCallSummariesForSenior('senior-1', 20);

    expect(analysisMocks.getLatestByConversationIds).toHaveBeenCalledWith(['conversation-1']);
    expect(calls[0].summary).toBe('Analysis fallback summary');
    expect(calls[0]).not.toHaveProperty('analysis');
  });

  it('selects summary-only recent records scoped to authorized senior IDs', async () => {
    dbMocks.state.selectRows = [{
      id: 'conversation-1',
      seniorId: 'senior-1',
      seniorName: 'Test Senior',
      startedAt: new Date('2026-04-14T10:00:00Z'),
      endedAt: null,
      durationSeconds: 45,
      status: 'completed',
      summary: 'Recent summary',
      summaryEncrypted: null,
      sentiment: 'neutral',
    }];

    const calls = await conversationService.getRecentCallSummariesForSeniors(['senior-1'], 50);

    const selectedFields = Object.keys(dbMocks.select.mock.calls[0][0]);
    expect(selectedFields).toContain('seniorName');
    expect(selectedFields).not.toContain('callSid');
    expect(selectedFields).not.toContain('transcript');
    expect(selectedFields).not.toContain('transcriptEncrypted');
    expect(selectedFields).not.toContain('transcriptTextEncrypted');
    expect(dbMocks.selectWhere).toHaveBeenCalled();
    expect(calls[0]).toMatchObject({
      id: 'conversation-1',
      seniorId: 'senior-1',
      seniorName: 'Test Senior',
      summary: 'Recent summary',
    });
    expect(calls[0]).not.toHaveProperty('transcript');
  });
});
