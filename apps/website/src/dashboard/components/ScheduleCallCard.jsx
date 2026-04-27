const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ScheduleCallCard({ call, reminderMap, onEdit, onDelete }) {
  const time = formatTime(call.time || '10:00');

  let frequencyLabel;
  if (call.frequency === 'daily') {
    frequencyLabel = 'Every Day';
  } else if (call.frequency === 'recurring' && call.recurringDays) {
    if (call.recurringDays.length === 7) {
      frequencyLabel = 'Every Day';
    } else {
      frequencyLabel = call.recurringDays.map((i) => DAYS_FULL[i]?.slice(0, 3)).join(', ');
    }
  } else {
    frequencyLabel = 'One-time';
  }

  // Get tagged reminder titles
  const taggedReminders = (call.reminderIds || [])
    .map((id) => reminderMap?.[id])
    .filter(Boolean);

  return (
    <div className="db-card" style={{ padding: 16, borderRadius: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-1)', marginBottom: 4 }}>
            {call.title || 'Scheduled Call'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--fg-2)' }}>
            <span>{time}</span>
            <span style={{
              display: 'inline-flex',
              padding: '2px 8px',
              background: 'var(--color-cream-deep)',
              borderRadius: 'var(--radius-pill)',
              fontSize: 12,
              color: 'var(--fg-2)',
            }}>
              {frequencyLabel}
            </span>
          </div>
          {taggedReminders.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {taggedReminders.map((title, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-2)' }}>
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--color-rose)',
                    flexShrink: 0,
                  }} />
                  {title}
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="db-btn db-btn--icon" onClick={onEdit} title="Edit">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function formatTime(time) {
  // Handle both "HH:MM" and "H:MM AM/PM" formats
  if (/am|pm/i.test(time)) return time;
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}
