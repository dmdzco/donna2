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

  const maxTokens = Math.max(...turnMetrics.map(t => t.inputTokens + t.outputTokens), 1);
  const maxResponseTime = Math.max(...turnMetrics.map(t => t.responseTime), 1);

  return (
    <div className="metrics-panel">
      <h3>Call Metrics</h3>

      {callMetrics && (
        <div className="metrics-summary">
          <div className="summary-card">
            <div className="summary-label">Total Tokens</div>
            <div className="summary-value">{callMetrics.totalTokens.toLocaleString()}</div>
            <div className="summary-detail">
              {callMetrics.totalInputTokens.toLocaleString()} in / {callMetrics.totalOutputTokens.toLocaleString()} out
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Est. Cost</div>
            <div className="summary-value">${callMetrics.estimatedCost.toFixed(4)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Avg Response</div>
            <div className="summary-value">{callMetrics.avgResponseTime}ms</div>
          </div>
          {callMetrics.avgTtfa != null && (
            <div className="summary-card">
              <div className="summary-label">Avg TTFA</div>
              <div className="summary-value">{callMetrics.avgTtfa}ms</div>
            </div>
          )}
          <div className="summary-card">
            <div className="summary-label">Models</div>
            <div className="summary-value summary-value-small">{callMetrics.modelsUsed.join(', ')}</div>
          </div>
        </div>
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
