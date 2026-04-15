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

  if (!data) {
    return (
      <div className="observer-panel empty">
        <p>No observer data for this call</p>
      </div>
    );
  }

  const { summary, signals, postCall } = data;
  const hasSignals = data.count > 0;
  const hasPostCall = Boolean(
    postCall?.sentiment ||
    postCall?.mood ||
    postCall?.engagementScore != null ||
    postCall?.topics?.length ||
    postCall?.concerns?.length ||
    postCall?.positiveObservations?.length ||
    postCall?.followUpSuggestions?.length ||
    postCall?.caregiverTakeaways?.length ||
    postCall?.recommendedCaregiverAction ||
    postCall?.callQuality
  );

  if (!hasSignals && !hasPostCall) {
    return (
      <div className="observer-panel empty">
        <p>No observer or post-call signals for this call</p>
      </div>
    );
  }

  return (
    <div className="observer-panel">
      <h3>Observer</h3>

      <div className="observer-summary">
        <div className="summary-card">
          <div className="summary-label">Sentiment</div>
          <div className="summary-value summary-value-small">{postCall?.sentiment || 'unknown'}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Mood</div>
          <div className="summary-value summary-value-small">{postCall?.mood || 'unknown'}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Engagement</div>
          <div className="summary-value">
            {postCall?.engagementScore != null ? postCall.engagementScore : '--'}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Concerns</div>
          <div className="summary-value concerns">{summary.totalConcerns}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Turn Signals</div>
          <div className="summary-value">{data.count}</div>
        </div>
      </div>

      {!hasSignals && (
        <div className="analysis-empty observer-note">
          Per-turn observer signals were not captured for this call. Showing post-call analysis instead.
        </div>
      )}

      {postCall?.caregiverTakeaways && postCall.caregiverTakeaways.length > 0 && (
        <section className="analysis-section">
          <h4>Caregiver Takeaways</h4>
          <ul className="analysis-list">
            {postCall.caregiverTakeaways.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {postCall?.recommendedCaregiverAction && (
        <section className="analysis-section">
          <h4>Recommended Action</h4>
          <p className="analysis-summary">{postCall.recommendedCaregiverAction}</p>
        </section>
      )}

      {postCall?.positiveObservations && postCall.positiveObservations.length > 0 && (
        <section className="analysis-section">
          <h4>Positive Observations</h4>
          <ul className="analysis-list">
            {postCall.positiveObservations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {postCall?.followUpSuggestions && postCall.followUpSuggestions.length > 0 && (
        <section className="analysis-section">
          <h4>Follow-Up Suggestions</h4>
          <ul className="analysis-list">
            {postCall.followUpSuggestions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}

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

      {postCall?.topics && postCall.topics.length > 0 && (
        <section className="analysis-section">
          <h4>Topics</h4>
          <div className="analysis-pills">
            {postCall.topics.map((topic, index) => (
              <span className="analysis-pill" key={`${topic}-${index}`}>{topic}</span>
            ))}
          </div>
        </section>
      )}

      {postCall?.callQuality && (
        <section className="analysis-section">
          <h4>Call Quality</h4>
          <dl className="quality-grid">
            {Object.entries(postCall.callQuality).map(([key, value]) => (
              <div className="quality-item" key={key}>
                <dt>{formatLabel(key)}</dt>
                <dd>{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {hasSignals && (
        <>
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

          <div className="distribution-section">
            <h4>Emotional States</h4>
            <div className="emotion-pills">
              {Object.entries(summary.emotionalStateDistribution).map(([state, count]) => (
                <span key={state} className={`emotion-pill emotion-${state}`}>
                  {state}: {count}
                </span>
              ))}
            </div>
          </div>

          <div className="signals-section">
            <h4>Signal History</h4>
            <div className="signals-list">
              {signals.map((item, index) => (
                <SignalItem key={index} item={item} index={index} />
              ))}
            </div>
          </div>
        </>
      )}
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
          {signal.emotionalState}
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

function formatLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value == null) return 'Unknown';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'object') return 'Recorded';
  return String(value);
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
