export default function CallCard({ conversation }) {
  const date = new Date(conversation.startedAt || conversation.createdAt);
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const duration = conversation.durationSeconds
    ? formatDuration(conversation.durationSeconds)
    : null;

  const status = conversation.status || 'completed';
  const summary = conversation.summary || conversation.analysis?.summary;

  return (
    <div className="db-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-charcoal)' }}>
            {dateStr} at {timeStr}
          </div>
          {duration && (
            <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 2 }}>{duration}</div>
          )}
        </div>
        <span className={`db-badge db-badge--${status}`}>{status}</span>
      </div>
      {summary && (
        <p style={{ fontSize: '0.9rem', color: '#555', lineHeight: 1.5, marginTop: 8 }}>
          {summary}
        </p>
      )}
    </div>
  );
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}
