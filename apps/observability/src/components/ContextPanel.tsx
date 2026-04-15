import { useMemo } from 'react';
import { useCallContextTrace } from '../hooks/useApi';
import type { ContextTraceEvent, LatencyBreakdownStat } from '../types';

interface ContextPanelProps {
  callId: string;
}

export function ContextPanel({ callId }: ContextPanelProps) {
  const { data, loading, error } = useCallContextTrace(callId);
  const events = data?.contextTrace.events || [];
  const stats = useMemo(() => summarizeEvents(events), [events]);
  const latencyBreakdown = useMemo(
    () => sortLatencyBreakdown(readLatencyBreakdown(data)),
    [data?.contextTrace.latency_breakdown, data?.latency?.stage_breakdown]
  );
  const hasTraceData = events.length > 0 || latencyBreakdown.length > 0;

  if (loading) {
    return <div className="context-panel loading">Loading context flow...</div>;
  }

  if (error) {
    return <div className="context-panel error">Error: {error}</div>;
  }

  if (!data || !hasTraceData) {
    return (
      <div className="context-panel empty">
        <p>No LLM context trace for this call</p>
        <p className="empty-hint">
          New calls after the context-trace deploy will include prompt sections, memory injections, tool results, and timing.
        </p>
      </div>
    );
  }

  return (
    <div className="context-panel">
      <div className="panel-heading">
        <div>
          <h3>LLM Context Flow</h3>
          <p>Prompt context, memory, tools, and timing for this call.</p>
        </div>
        <span className="context-captured">Captured {formatDate(data.contextTrace.captured_at)}</span>
      </div>

      <div className="metrics-summary context-summary">
        <ContextStat label="Trace Events" value={events.length.toLocaleString()} />
        <ContextStat label="Prompt Seeds" value={stats.seeded.toLocaleString()} />
        <ContextStat label="Memory Events" value={stats.memory.toLocaleString()} />
        <ContextStat label="Web Search" value={stats.web.toLocaleString()} tone={stats.web > 0 ? 'good' : undefined} />
        <ContextStat label="Latency Stages" value={latencyBreakdown.length.toLocaleString()} />
        <ContextStat label="LLM TTFB" value={formatMs(data.latency?.llm_ttfb_avg_ms)} />
        <ContextStat label="Turn Latency" value={formatMs(data.latency?.turn_avg_ms)} />
      </div>

      {latencyBreakdown.length > 0 && (
        <section className="context-section">
          <h4>Latency Breakdown</h4>
          <div className="metrics-table-wrapper">
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Avg</th>
                  <th>P95</th>
                  <th>Max</th>
                  <th>Samples</th>
                </tr>
              </thead>
              <tbody>
                {latencyBreakdown.map(([stage, entry]) => (
                  <tr key={stage}>
                    <td>{formatStageLabel(stage)}</td>
                    <td>{formatMs(entry.avg_ms)}</td>
                    <td>{formatMs(entry.p95_ms)}</td>
                    <td>{formatMs(entry.max_ms)}</td>
                    <td>{entry.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="context-section">
        <h4>Context Timeline</h4>
        {events.length > 0 ? (
          <div className="context-flow">
            {events.map((event) => (
              <ContextEventCard key={`${event.sequence}-${event.source}-${event.action}`} event={event} />
            ))}
          </div>
        ) : (
          <p className="empty-hint">
            Encrypted prompt-context events were not available for this call. Latency summaries were recovered from persisted call metrics.
          </p>
        )}
      </section>
    </div>
  );
}

function ContextStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="summary-card">
      <div className="summary-label">{label}</div>
      <div className={`summary-value summary-value-small ${tone ? `summary-${tone}` : ''}`}>{value}</div>
    </div>
  );
}

function ContextEventCard({ event }: { event: ContextTraceEvent }) {
  const metadata = Object.entries(event.metadata || {}).filter(([, value]) => value != null && value !== '');

  return (
    <article className="context-event">
      <div className="context-event-meta">
        <span className="context-offset">{formatOffset(event.timestamp_offset_ms)}</span>
        <span className={`context-source source-${sourceClass(event.source)}`}>{formatLabel(event.source)}</span>
        <span className="context-action">{formatLabel(event.action)}</span>
      </div>

      <div className="context-event-body">
        <div className="context-event-title">
          <h5>{event.label || formatLabel(event.source)}</h5>
          <div className="context-event-facts">
            {event.provider && <span>{formatLabel(event.provider)}</span>}
            {event.turn_sequence != null && <span>Turn {event.turn_sequence}</span>}
            {event.item_count != null && <span>{event.item_count} items</span>}
            {event.latency_ms != null && <span>{formatMs(event.latency_ms)}</span>}
            {event.content_chars != null && event.content_chars > 0 && <span>{event.content_chars.toLocaleString()} chars</span>}
          </div>
        </div>

        {event.content && (
          <pre className="context-content">
            {event.content}
            {event.content_truncated ? '\n[truncated]' : ''}
          </pre>
        )}

        {metadata.length > 0 && (
          <dl className="context-metadata">
            {metadata.map(([key, value]) => (
              <div key={key}>
                <dt>{formatLabel(key)}</dt>
                <dd>{formatMetadataValue(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}

function summarizeEvents(events: ContextTraceEvent[]) {
  return events.reduce(
    (acc, event) => {
      const source = event.source.toLowerCase();
      if (event.action === 'seeded') acc.seeded += 1;
      if (source.includes('memory')) acc.memory += 1;
      if (source.includes('web') || source.includes('search')) acc.web += 1;
      return acc;
    },
    { seeded: 0, memory: 0, web: 0 }
  );
}

function formatOffset(value?: number | null): string {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  const totalSeconds = Math.max(0, Math.round(Number(value) / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatMs(value?: number | null): string {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return `${Math.round(Number(value))}ms`;
}

function formatDate(value?: string | null): string {
  if (!value) return 'post-call';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'post-call';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function sourceClass(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function formatMetadataValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sortLatencyBreakdown(
  breakdown: Record<string, LatencyBreakdownStat>
): Array<[string, LatencyBreakdownStat]> {
  return Object.entries(breakdown).sort((a, b) => {
    const stageOrder = preferredStageOrder(a[0]) - preferredStageOrder(b[0]);
    if (stageOrder !== 0) return stageOrder;
    return (b[1]?.avg_ms || 0) - (a[1]?.avg_ms || 0);
  });
}

function readLatencyBreakdown(
  data: ReturnType<typeof useCallContextTrace>['data']
): Record<string, LatencyBreakdownStat> {
  const traceBreakdown = data?.contextTrace.latency_breakdown || {};
  if (Object.keys(traceBreakdown).length > 0) {
    return traceBreakdown;
  }
  return data?.latency?.stage_breakdown || {};
}

function preferredStageOrder(stage: string): number {
  const order = [
    'call.voice_answer_context',
    'call.voice_answer_total',
    'call.answer_to_ws',
    'call.flow_initialize',
    'transcription.window',
    'transcription.finalize_gap',
    'director.query',
    'director.speculative',
    'director.fallback',
    'prefetch.interim',
    'prefetch.final',
    'prefetch.director',
    'memory_gate.wait',
    'tool.web_search',
    'tool.mark_reminder_acknowledged',
    'llm_ttfb',
    'tts_ttfb',
    'turn.total',
  ];
  const index = order.indexOf(stage);
  return index === -1 ? order.length + 1 : index;
}

function formatStageLabel(stage: string): string {
  return stage
    .split('.')
    .map((part) => part.replace(/_/g, ' '))
    .map((part) => part.replace(/\b\w/g, (char) => char.toUpperCase()))
    .join(' / ');
}
