import { useCallMetrics } from '../hooks/useApi';
interface MetricsPanelProps {
  callId: string;
}

export function MetricsPanel({ callId }: MetricsPanelProps) {
  const { data, loading, error } = useCallMetrics(callId);

  if (loading) {
    return <div className="metrics-panel loading">Loading metrics...</div>;
  }

  if (error) {
    return <div className="metrics-panel error">Error: {error}</div>;
  }

  if (!data || (!data.callMetrics && data.turnMetrics.length === 0)) {
    return (
      <div className="metrics-panel empty">
        <p>No metrics data for this call</p>
        <p className="empty-hint">Metrics are captured for calls made after this feature was added.</p>
      </div>
    );
  }

  const { callMetrics, turnMetrics } = data;
  const hasTokenUsage = Boolean(callMetrics && callMetrics.totalTokens > 0);
  const maxTokens = Math.max(...turnMetrics.map(t => t.inputTokens + t.outputTokens), 1);
  const maxResponseTime = Math.max(...turnMetrics.map(t => t.responseTime), 1);

  return (
    <div className="metrics-panel">
      <h3>Call Metrics</h3>

      {callMetrics && (
        <>
          <div className="metrics-summary">
            <MetricCard label="Duration" value={formatDuration(callMetrics.durationSeconds ?? data.durationSeconds)} />
            <MetricCard label="Turns" value={formatNumber(callMetrics.turnCount)} />
            <MetricCard label="Errors" value={formatNumber(callMetrics.errorCount ?? 0)} tone={callMetrics.errorCount ? 'bad' : 'good'} />
            <MetricCard label="End Reason" value={formatToken(callMetrics.endReason)} />
            <MetricCard label="LLM TTFB" value={formatMs(callMetrics.llmTtfbAvgMs)} />
            <MetricCard label="TTS TTFB" value={formatMs(callMetrics.ttsTtfbAvgMs ?? callMetrics.avgTtfa)} />
            <MetricCard label="Turn Latency" value={formatMs(callMetrics.avgResponseTime)} />
            <MetricCard label="Tools" value={formatTools(callMetrics.toolsUsed)} />
          </div>

          {!hasTokenUsage && (
            <div className="analysis-empty metrics-note">
              Token and cost details were not captured for this call. Infrastructure timing and outcome metrics are shown instead.
            </div>
          )}

          {hasTokenUsage && (
            <div className="metrics-summary metrics-summary-secondary">
              <MetricCard label="Total Tokens" value={callMetrics.totalTokens.toLocaleString()} detail={`${callMetrics.totalInputTokens.toLocaleString()} in / ${callMetrics.totalOutputTokens.toLocaleString()} out`} />
              <MetricCard label="Est. Cost" value={callMetrics.estimatedCost != null ? `$${callMetrics.estimatedCost.toFixed(4)}` : '--'} />
              <MetricCard label="Models" value={callMetrics.modelsUsed.length > 0 ? callMetrics.modelsUsed.join(', ') : '--'} />
            </div>
          )}

          {callMetrics.breakerStates && Object.keys(callMetrics.breakerStates).length > 0 && (
            <MetricsObjectSection title="Circuit Breakers" values={callMetrics.breakerStates} />
          )}
        </>
      )}

      {turnMetrics.length > 0 && (
        <div className="metrics-section">
          <h4>Token Usage Per Turn</h4>
          <div className="metrics-chart">
            {turnMetrics.map((turn) => (
              <div key={turn.turnIndex} className="chart-row">
                <span className="chart-label">#{turn.turnIndex + 1}</span>
                <div className="chart-bar-container">
                  <div
                    className="chart-bar chart-bar-input"
                    style={{ width: `${(turn.inputTokens / maxTokens) * 100}%` }}
                    title={`Input: ${turn.inputTokens}`}
                  />
                  <div
                    className="chart-bar chart-bar-output"
                    style={{ width: `${(turn.outputTokens / maxTokens) * 100}%` }}
                    title={`Output: ${turn.outputTokens}`}
                  />
                </div>
                <span className="chart-value">{turn.inputTokens + turn.outputTokens}</span>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            <span className="legend-item"><span className="legend-dot input" /> Input</span>
            <span className="legend-item"><span className="legend-dot output" /> Output</span>
          </div>
        </div>
      )}

      {turnMetrics.length > 0 && (
        <div className="metrics-section">
          <h4>Response Latency Per Turn</h4>
          <div className="metrics-chart">
            {turnMetrics.map((turn) => (
              <div key={turn.turnIndex} className="chart-row">
                <span className="chart-label">#{turn.turnIndex + 1}</span>
                <div className="chart-bar-container">
                  {turn.ttfa != null && (
                    <div
                      className="chart-bar chart-bar-ttfa"
                      style={{ width: `${(turn.ttfa / maxResponseTime) * 100}%` }}
                      title={`TTFA: ${turn.ttfa}ms`}
                    />
                  )}
                  <div
                    className="chart-bar chart-bar-response"
                    style={{ width: `${(turn.responseTime / maxResponseTime) * 100}%` }}
                    title={`Total: ${turn.responseTime}ms`}
                  />
                </div>
                <span className="chart-value">{turn.responseTime}ms</span>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            <span className="legend-item"><span className="legend-dot ttfa" /> TTFA</span>
            <span className="legend-item"><span className="legend-dot response" /> Total</span>
          </div>
        </div>
      )}

      {turnMetrics.length > 0 && (
        <div className="metrics-section">
          <h4>Turn Details</h4>
          <div className="metrics-table-wrapper">
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Model</th>
                  <th>Max Tok</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>TTFA</th>
                  <th>Response</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {turnMetrics.map((turn) => (
                  <tr key={turn.turnIndex}>
                    <td>{turn.turnIndex + 1}</td>
                    <td>{turn.model}</td>
                    <td>{turn.maxTokens}</td>
                    <td>{turn.inputTokens}</td>
                    <td>{turn.outputTokens}</td>
                    <td>{turn.ttfa != null ? `${turn.ttfa}ms` : '-'}</td>
                    <td>{turn.responseTime}ms</td>
                    <td><span className="reason-badge">{turn.tokenReason}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="summary-card">
      <div className="summary-label">{label}</div>
      <div className={`summary-value summary-value-small ${tone ? `summary-${tone}` : ''}`}>{value}</div>
      {detail && <div className="summary-detail">{detail}</div>}
    </div>
  );
}

function MetricsObjectSection({
  title,
  values,
  formatter = formatToken,
}: {
  title: string;
  values: Record<string, unknown>;
  formatter?: (value: unknown) => string;
}) {
  return (
    <section className="metrics-section">
      <h4>{title}</h4>
      <dl className="quality-grid">
        {Object.entries(values).map(([key, value]) => (
          <div className="quality-item" key={key}>
            <dt>{formatLabel(key)}</dt>
            <dd>{formatter(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function formatDuration(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '--';
  const total = Math.max(0, Math.round(Number(seconds)));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatMs(value: unknown): string {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return `${Math.round(Number(value))}ms`;
}

function formatNumber(value?: number | null): string {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return Number(value).toLocaleString();
}

function formatToken(value: unknown): string {
  if (value == null || value === '') return '--';
  return String(value).replace(/_/g, ' ');
}

function formatTools(value?: string[] | null): string {
  return value && value.length > 0 ? value.join(', ') : 'none';
}

function formatLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}
