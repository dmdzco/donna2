import { useState } from 'react';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ScheduleCalendar({ selectedDate, onSelectDate, scheduledDays }) {
  const [viewDate, setViewDate] = useState(new Date(selectedDate));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} className="sc-cell sc-cell--empty" />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dayName = DAYS_FULL[date.getDay()];
    const isToday = date.toDateString() === today.toDateString();
    const isSelected = date.toDateString() === selectedDate.toDateString();
    const hasCall = scheduledDays.has(dayName);

    cells.push(
      <button
        key={day}
        className={[
          'sc-cell',
          isToday && 'sc-cell--today',
          isSelected && 'sc-cell--selected',
        ].filter(Boolean).join(' ')}
        onClick={() => onSelectDate(date)}
      >
        <span>{day}</span>
        {hasCall && <span className="sc-dot" />}
      </button>
    );
  }

  return (
    <div className="db-card" style={{ padding: 20 }}>
      <div className="sc-header">
        <button className="sc-nav" onClick={prevMonth}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="sc-month">{MONTHS[month]} {year}</span>
        <button className="sc-nav" onClick={nextMonth}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
      <div className="sc-grid">
        {DAYS_SHORT.map((d) => (
          <div key={d} className="sc-cell sc-cell--header">{d}</div>
        ))}
        {cells}
      </div>
      <style>{calendarCSS}</style>
    </div>
  );
}

const calendarCSS = `
.sc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.sc-month {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-charcoal);
}
.sc-nav {
  background: none;
  border: none;
  padding: 6px;
  border-radius: 8px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}
.sc-nav:hover {
  background: var(--color-cream);
  color: var(--color-charcoal);
}
.sc-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.sc-cell {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 0.85rem;
  border: none;
  background: none;
  cursor: pointer;
  position: relative;
  color: var(--color-charcoal);
  transition: all 0.15s;
}
.sc-cell:hover {
  background: var(--color-cream);
}
.sc-cell--empty {
  cursor: default;
}
.sc-cell--empty:hover {
  background: none;
}
.sc-cell--header {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  color: #999;
  cursor: default;
  aspect-ratio: auto;
  padding: 4px 0;
}
.sc-cell--header:hover {
  background: none;
}
.sc-cell--today {
  font-weight: 700;
  color: var(--color-sage);
}
.sc-cell--selected {
  background: var(--color-sage) !important;
  color: white !important;
  font-weight: 600;
}
.sc-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-sage);
  position: absolute;
  bottom: 4px;
}
.sc-cell--selected .sc-dot {
  background: white;
}
`;
