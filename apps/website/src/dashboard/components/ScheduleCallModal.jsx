import { useState } from 'react';

const ALL_DAYS = [
  { idx: 1, label: 'Mon' },
  { idx: 2, label: 'Tue' },
  { idx: 3, label: 'Wed' },
  { idx: 4, label: 'Thu' },
  { idx: 5, label: 'Fri' },
  { idx: 6, label: 'Sat' },
  { idx: 0, label: 'Sun' },
];

const TIME_OPTIONS = [];
for (let h = 7; h <= 21; h++) {
  for (const m of ['00', '30']) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    TIME_OPTIONS.push({ value: `${h}:${m}`, label: `${hour}:${m} ${ampm}` });
  }
}

export default function ScheduleCallModal({ call, reminders = [], onSave, onClose }) {
  const [title, setTitle] = useState(call?.title || 'Daily Check-in');
  const [frequency, setFrequency] = useState(call?.frequency || 'daily');
  const [recurringDays, setRecurringDays] = useState(
    call?.recurringDays || [1, 2, 3, 4, 5]
  );
  const [time, setTime] = useState(call?.time || '10:00');
  const [selectedReminderIds, setSelectedReminderIds] = useState(call?.reminderIds || []);
  const [saving, setSaving] = useState(false);

  const toggleDay = (dayIdx) => {
    setRecurringDays((prev) =>
      prev.includes(dayIdx) ? prev.filter((d) => d !== dayIdx) : [...prev, dayIdx]
    );
  };

  const toggleReminder = (reminderId) => {
    setSelectedReminderIds((prev) =>
      prev.includes(reminderId) ? prev.filter((id) => id !== reminderId) : [...prev, reminderId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const callData = {
      title: title.trim() || 'Daily Check-in',
      frequency,
      time,
    };
    if (frequency === 'recurring') {
      callData.recurringDays = recurringDays;
    }
    if (selectedReminderIds.length > 0) {
      callData.reminderIds = selectedReminderIds;
    }
    await onSave(callData);
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
            <div className="db-pills">
              <button
                type="button"
                className={`db-pill ${frequency === 'daily' ? 'db-pill--active' : ''}`}
                onClick={() => setFrequency('daily')}
              >
                Every Day
              </button>
              <button
                type="button"
                className={`db-pill ${frequency === 'recurring' ? 'db-pill--active' : ''}`}
                onClick={() => setFrequency('recurring')}
              >
                Specific Days
              </button>
            </div>
          </div>

          {frequency === 'recurring' && (
            <div className="db-field">
              <label className="db-label">Days</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ALL_DAYS.map(({ idx, label }) => (
                  <button
                    key={idx}
                    type="button"
                    className={`db-pill ${recurringDays.includes(idx) ? 'db-pill--active' : ''}`}
                    onClick={() => toggleDay(idx)}
                  >
                    {label}
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

          {reminders.length > 0 && (
            <div className="db-field">
              <label className="db-label">Reminders to deliver on this call</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {reminders.filter((r) => r.isActive !== false).map((reminder) => (
                  <label
                    key={reminder.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      fontSize: 14,
                      color: 'var(--fg-1)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedReminderIds.includes(reminder.id)}
                      onChange={() => toggleReminder(reminder.id)}
                      style={{ accentColor: 'var(--color-sage-dark)' }}
                    />
                    {reminder.title}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="db-modal__actions">
            <button type="button" className="db-btn db-btn--ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className="db-btn db-btn--primary"
              disabled={saving || (frequency === 'recurring' && recurringDays.length === 0)}
            >
              {saving ? 'Saving...' : call ? 'Save Changes' : 'Add Call'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
