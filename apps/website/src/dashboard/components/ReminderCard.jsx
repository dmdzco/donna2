export default function ReminderCard({ reminder, onEdit, onDelete }) {
  const frequency = reminder.isRecurring ? 'Daily' : 'One-time';
  const badgeClass = reminder.isRecurring ? 'db-badge--daily' : 'db-badge--one-time';

  return (
    <div className="db-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-charcoal)' }}>
              {reminder.title}
            </span>
            <span className={`db-badge ${badgeClass}`}>{frequency}</span>
          </div>
          {reminder.description && (
            <p style={{ fontSize: '0.85rem', color: '#888', lineHeight: 1.5 }}>
              {reminder.description}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="db-btn db-btn--icon" onClick={onEdit} title="Edit">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button className="db-btn db-btn--icon" onClick={onDelete} title="Delete" style={{ color: '#d44' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
