import type { Call } from '../types';

interface AnalysisPanelProps {
  call: Call;
}

export function AnalysisPanel({ call }: AnalysisPanelProps) {
  const analysis = call.analysis;
  const summary = analysis?.summary || call.summary;
  const topics = analysis?.topics || [];
  const concerns = analysis?.concerns || call.concerns || [];
  const positiveObservations = analysis?.positiveObservations || [];
  const followUpSuggestions = analysis?.followUpSuggestions || [];
  const callQuality = analysis?.callQuality || null;
  const hasAnalysis = Boolean(
    summary ||
    analysis?.engagementScore != null ||
    topics.length ||
    concerns.length ||
    positiveObservations.length ||
    followUpSuggestions.length ||
    callQuality
  );

  if (!hasAnalysis) {
    return (
      <div className="analysis-panel">
        <h3>Post-Call Analysis</h3>
        <div className="analysis-empty">No post-call analysis available yet.</div>
      </div>
    );
  }

  return (
    <div className="analysis-panel">
      <div className="analysis-header">
        <h3>Post-Call Analysis</h3>
        {analysis?.engagementScore != null && (
          <div className="analysis-score">
            <span className="analysis-score-value">{analysis.engagementScore}</span>
            <span className="analysis-score-label">Engagement</span>
          </div>
        )}
      </div>

      {summary && (
        <section className="analysis-section">
          <h4>Summary</h4>
          <p className="analysis-summary">{summary}</p>
        </section>
      )}

      {topics.length > 0 && (
        <section className="analysis-section">
          <h4>Topics</h4>
          <div className="analysis-pills">
            {topics.map((topic, index) => (
              <span className="analysis-pill" key={`${topic}-${index}`}>{topic}</span>
            ))}
          </div>
        </section>
      )}

      {concerns.length > 0 && (
        <section className="analysis-section">
          <h4>Concerns</h4>
          <ul className="analysis-list concern-list">
            {concerns.map((concern, index) => (
              <li key={index}>{formatConcern(concern)}</li>
            ))}
          </ul>
        </section>
      )}

      {positiveObservations.length > 0 && (
        <section className="analysis-section">
          <h4>Positive Observations</h4>
          <ul className="analysis-list">
            {positiveObservations.map((observation, index) => (
              <li key={index}>{observation}</li>
            ))}
          </ul>
        </section>
      )}

      {followUpSuggestions.length > 0 && (
        <section className="analysis-section">
          <h4>Follow-Up Suggestions</h4>
          <ul className="analysis-list">
            {followUpSuggestions.map((suggestion, index) => (
              <li key={index}>{suggestion}</li>
            ))}
          </ul>
        </section>
      )}

      {callQuality && (
        <section className="analysis-section">
          <h4>Call Quality</h4>
          <dl className="quality-grid">
            {Object.entries(callQuality).map(([key, value]) => (
              <div className="quality-item" key={key}>
                <dt>{formatLabel(key)}</dt>
                <dd>{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

function formatConcern(concern: string | Record<string, unknown>): string {
  if (typeof concern === 'string') return concern;
  const description = concern.description || concern.concern || concern.text;
  const severity = concern.severity || concern.level;
  const type = concern.type || concern.category;
  return [type, severity, description].filter(Boolean).map(String).join(' - ') || 'Concern noted';
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
