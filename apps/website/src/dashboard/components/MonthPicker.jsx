import { useState } from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function MonthPicker({ currentDate, onSelectMonth }) {
  const [open, setOpen] = useState(false);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handleSelect = (monthIdx) => {
    const newDate = new Date(year, monthIdx, 1);
    onSelectMonth(newDate);
    setOpen(false);
  };

  return (
    <>
      <button className="db-month-btn" onClick={() => setOpen(true)}>
        {MONTHS_FULL[month]} {year}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="db-month-overlay" onClick={() => setOpen(false)}>
          <div className="db-month-grid" onClick={(e) => e.stopPropagation()}>
            {MONTHS.map((m, i) => (
              <button
                key={m}
                className={`db-month-grid__item ${i === month ? 'db-month-grid__item--active' : ''}`}
                onClick={() => handleSelect(i)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
