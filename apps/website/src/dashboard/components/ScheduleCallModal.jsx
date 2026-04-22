import { useState } from 'react';

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_OPTIONS = [];
for (let h = 7; h <= 21; h++) {
  for (const m of ['00', '30']) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    TIME_OPTIONS.push({ value: `${h}:${m}`, label: `${hour}:${m} ${ampm}` });
  }
}

export default function ScheduleCallModal({ call, reminders, onSave, onClose }) {
  const [title, setTitle] = useState(call?.title || 'Daily Check-in');
  const [frequency, setFrequency] = useState(
    call?.frequency || (call?.days?.length === 7 ? 'daily' : call?.days?.length ? 'specific' : 'daily')
  );
  const [days, setDays] = useState(call?.days || [...ALL_DAYS]);
  const [time, setTime] = useState(call?.time || '10:00');
  const [saving, setSaving] = useState(false);

  const toggleDay = (day) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const callDays = frequency === 'daily' ? [...ALL_DAYS] : days;
    await onSave({
      title: title.trim() || 'Daily Check-in',
      frequency,
      days: callDays,
      time,
      reminderIds: call?.reminderIds || [],
    });
    setSaving(false);
  };

  return (
    <div className="db-modal-overlay" onClick={onClose}>
      <div className="db-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="db-modal__title">{call ? 'Edit Call' : 'Schedule a Call'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="db-field">
            <label className="db-label">Title</label>
            <input
              className="db-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Morning Check-in"
            />
          </div>

          <div className="db-field">
            <label className="db-label">Frequency</label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { value: 'daily', label: 'Every Day' },
                { value: 'specific', label: 'Specific Days' },
              ].map((opt) => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="radio"
                    name="frequency"
                    checked={frequency === opt.value}
                    onChange={() => setFrequency(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {frequency === 'specific' && (
            <div className="db-field">
              <label className="db-label">Days</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ALL_DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={`db-pill ${days.includes(day) ? 'db-pill--active' : ''}`}
                    onClick={() => toggleDay(day)}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="db-field">
            <label className="db-label">Time</label>
            <select
              className="db-input"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            >
              {TIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="db-modal__actions">
            <button type="button" className="db-btn db-btn--secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className="db-btn db-btn--primary"
              disabled={saving || (frequency === 'specific' && days.length === 0)}
            >
              {saving ? 'Saving...' : call ? 'Save Changes' : 'Add Call'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
