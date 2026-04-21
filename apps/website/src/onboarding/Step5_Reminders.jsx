import { PlusIcon, TrashIcon } from './icons';

export default function Step5_Reminders({ data, update }) {
  const reminders = data.reminders || [];

  const addReminder = () => {
    update({ reminders: [...reminders, { title: '', description: '' }] });
  };

  const updateReminder = (index, field, value) => {
    const updated = reminders.map((r, i) =>
      i === index ? { ...r, [field]: value } : r
    );
    update({ reminders: updated });
  };

  const removeReminder = (index) => {
    update({ reminders: reminders.filter((_, i) => i !== index) });
  };

  return (
    <div>
      <h1 className="ob-step-title">Reminders</h1>
      <p className="ob-step-subtitle">
        Add things Donna should gently remind your loved one about during calls. This is optional — you can always add more later.
      </p>

      <div className="ob-reminder-list">
        {reminders.map((reminder, i) => (
          <div key={i} className="ob-reminder-card">
            <button
              className="ob-reminder-card__remove"
              onClick={() => removeReminder(i)}
              aria-label="Remove reminder"
              type="button"
            >
              <TrashIcon size={16} />
            </button>
            <div className="ob-form-group" style={{ marginBottom: 12 }}>
              <label className="ob-label">Reminder title</label>
              <input
                className="ob-input"
                type="text"
                value={reminder.title}
                onChange={(e) => updateReminder(i, 'title', e.target.value)}
                placeholder="e.g., Take morning medication"
              />
            </div>
            <div className="ob-form-group" style={{ marginBottom: 0 }}>
              <label className="ob-label">Details (optional)</label>
              <textarea
                className="ob-textarea"
                value={reminder.description}
                onChange={(e) => updateReminder(i, 'description', e.target.value)}
                placeholder="Any additional details for Donna..."
                rows={2}
              />
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="ob-add-btn" onClick={addReminder}>
        <PlusIcon size={18} />
        Add a reminder
      </button>
    </div>
  );
}
