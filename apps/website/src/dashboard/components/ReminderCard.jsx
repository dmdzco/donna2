export default function ReminderCard({ reminder, onEdit, onToggle }) {
  const frequency = reminder.isRecurring ? 'Daily' : 'One-time';

  return (
    <div className="db-reminder" onClick={onEdit}>
      <div className="db-reminder__icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="db-reminder__title">{reminder.title}</div>
        <div className="db-reminder__meta">{frequency}</div>
      </div>
      <button
        className={`db-toggle__switch ${reminder.isActive !== false ? 'db-toggle__switch--on' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        type="button"
        aria-label={`Toggle ${reminder.title}`}
      />
    </div>
  );
}
