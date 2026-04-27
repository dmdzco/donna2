export default function ScheduleCallCard({ call, onEdit, onDelete }) {
  const time = formatTime(call.time || '10:00');
  const frequency = call.frequency === 'daily'
    ? 'Daily'
    : call.days?.length === 7
      ? 'Daily'
      : call.days?.join(', ') || 'One-time';

  return (
    <div className="db-card" style={{ padding: 16, borderRadius: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-1)', marginBottom: 2 }}>
            {call.title || 'Scheduled Call'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>
            {time}
            <span style={{
              display: 'inline-flex',
              marginLeft: 8,
              padding: '2px 8px',
              background: 'var(--color-cream-deep)',
              borderRadius: 'var(--radius-pill)',
              fontSize: 12,
              color: 'var(--fg-2)',
            }}>
              {frequency}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, opacity: 0.6, transition: 'opacity 150ms' }}>
          <button className="db-btn db-btn--icon" onClick={onEdit} title="Edit">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button className="db-btn db-btn--icon" onClick={onDelete} title="Delete" style={{ color: 'var(--color-danger)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(time) {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}
