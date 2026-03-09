import { useObserverSignals } from '../hooks/useApi';

interface ObserverPanelProps {
  callId: string;
}

export function ObserverPanel({ callId }: ObserverPanelProps) {
  const { data, loading, error } = useObserverSignals(callId);

  if (loading) {
    return <div className="observer-panel loading">Loading observer data...</div>;
  }

  if (error) {
    return <div className="observer-panel error">Error: {error}</div>;
  }

  if (!data || data.count === 0) {
    return (
      <div className="observer-panel empty">
        <p>No observer signals for this call</p>
      </div>
    );
  }

  const { summary, signals } = data;

  return (
    <div className="observer-panel">
      <h3>Observer Agent Analysis</h3>

      {/* Summary Stats */}
      <div className="observer-summary">
        <div className="summary-card">
          <div className="summary-label">Avg Confidence</div>
          <div className="summary-value">{Math.round(summary.averageConfidence * 100)}%</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Total Concerns</div>
          <div className="summary-value concerns">{summary.totalConcerns}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Signals</div>
          <div className="summary-value">{data.count}</div>
        </div>
      </div>

      {/* Engagement Distribution */}
      <div className="distribution-section">
        <h4>Engagement Over Time</h4>
        <div className="distribution-bars">
          {Object.entries(summary.engagementDistribution).map(([level, count]) => (
            <div key={level} className="distribution-bar">
              <span className="bar-label">{level}</span>
              <div className="bar-container">
                <div
                  className={`bar bar-engagement-${level}`}
                  style={{ width: `${(count / data.count) * 100}%` }}
                />
              </div>
              <span className="bar-count">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Emotional State Distribution */}
      <div className="distribution-section">
        <h4>Emotional States</h4>
        <div className="emotion-pills">
          {Object.entries(summary.emotionalStateDistribution).map(([state, count]) => (
            <span key={state} className={`emotion-pill emotion-${state}`}>
              {getEmotionEmoji(state)} {state}: {count}
            </span>
          ))}
        </div>
      </div>

      {/* Concerns */}
      {summary.uniqueConcerns.length > 0 && (
        <div className="concerns-section">
          <h4>Concerns Flagged</h4>
          <ul className="concerns-list">
            {summary.uniqueConcerns.map((concern, i) => (
              <li key={i} className="concern-item">{concern}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Analysis Summary (from post-call analysis) */}
      {data.analysis && (
        <div className="analysis-section">
          <h4>Post-Call Analysis</h4>
          <div className="analysis-details">
            {data.analysis.engagementScore != null && (
              <div className="analysis-row">
                <span className="analysis-label">Engagement Score</span>
                <span className="analysis-value">{data.analysis.engagementScore}/10</span>
              </div>
            )}
            {data.analysis.rapport && (
              <div className="analysis-row">
                <span className="analysis-label">Rapport</span>
                <span className={`rapport-badge rapport-${data.analysis.rapport}`}>{data.analysis.rapport}</span>
              </div>
            )}
            {data.analysis.goalsAchieved != null && (
              <div className="analysis-row">
                <span className="analysis-label">Goals Achieved</span>
                <span className="analysis-value">{data.analysis.goalsAchieved ? 'Yes' : 'No'}</span>
              </div>
            )}
            {data.analysis.positiveObservations?.length > 0 && (
              <div className="analysis-row analysis-list">
                <span className="analysis-label">Positive Observations</span>
                <ul>{data.analysis.positiveObservations.map((obs: string, i: number) => <li key={i}>{obs}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Signal Timeline */}
      <div className="signals-section">
        <h4>Signal History</h4>
        <div className="signals-list">
          {signals.map((item, index) => (
            <SignalItem key={index} item={item} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface SignalItemProps {
  item: {
    turnId: string;
    speaker: string;
    turnContent: string;
    timestamp: string;
    signal: {
      engagementLevel: string;
      emotionalState: string;
      confidenceScore: number;
      shouldDeliverReminder: boolean;
      shouldEndCall: boolean;
      concerns: string[];
    };
  };
  index: number;
}

function SignalItem({ item, index }: SignalItemProps) {
  const { signal, turnContent, speaker } = item;

  return (
    <div className="signal-item">
      <div className="signal-header">
        <span className="signal-index">#{index + 1}</span>
        <span className={`engagement-badge engagement-${signal.engagementLevel}`}>
          {signal.engagementLevel}
        </span>
        <span className={`emotion-badge emotion-${signal.emotionalState}`}>
          {getEmotionEmoji(signal.emotionalState)} {signal.emotionalState}
        </span>
        <span className="confidence-badge">
          {Math.round(signal.confidenceScore * 100)}%
        </span>
      </div>
      <div className="signal-context">
        <span className="speaker-label">{speaker}:</span>
        <span className="turn-preview">{truncate(turnContent, 100)}</span>
      </div>
      <div className="signal-flags">
        {signal.shouldDeliverReminder && (
          <span className="flag flag-reminder">Deliver Reminder</span>
        )}
        {signal.shouldEndCall && (
          <span className="flag flag-end">End Call</span>
        )}
        {signal.concerns.length > 0 && (
          <span className="flag flag-concerns">{signal.concerns.length} concerns</span>
        )}
      </div>
    </div>
  );
}

function getEmotionEmoji(emotion: string): string {
  const emojis: Record<string, string> = {
    positive: '😊',
    neutral: '😐',
    negative: '😟',
    confused: '😕',
    distressed: '😰',
  };
  return emojis[emotion] || '•';
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
