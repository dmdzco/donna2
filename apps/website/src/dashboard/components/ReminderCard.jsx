const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ReminderCard({ reminder, linkedCalls, onEdit, onDelete }) {
  return (
    <div className="db-reminder">
      <div style={{ minWidth: 0 }}>
        <div className="db-reminder__title">{reminder.title}</div>
        {reminder.description && (
          <div className="db-reminder__desc">{reminder.description.split('\n\nFAQs:\n')[0]}</div>
        )}
        {linkedCalls.length > 0 && (
          <div className="db-reminder__calls">
            {linkedCalls.map((call, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-2)' }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--color-rose)',
                  flexShrink: 0,
                }} />
                {call.title || 'Scheduled Call'} &middot; {formatCallSchedule(call)}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="db-reminder__actions">
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
  );
}

function formatCallSchedule(call) {
  const time = formatTime(call.time || '10:00');
  if (call.frequency === 'daily') return `Daily at ${time}`;
  if (call.frequency === 'recurring' && call.recurringDays) {
    if (call.recurringDays.length === 7) return `Daily at ${time}`;
    const days = call.recurringDays.map((i) => DAYS_FULL[i]?.slice(0, 3)).join(', ');
    return `${days} at ${time}`;
  }
  return `One-time at ${time}`;
}

function formatTime(time) {
  if (/am|pm/i.test(time)) return time;
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}
