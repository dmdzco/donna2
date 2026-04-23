import { useState } from 'react';

export default function ReminderModal({ reminder, onSave, onClose }) {
  const [title, setTitle] = useState(reminder?.title || '');
  const [description, setDescription] = useState(reminder?.description || '');
  const [isRecurring, setIsRecurring] = useState(reminder?.isRecurring ?? true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await onSave({
      title: title.trim(),
      description: description.trim(),
      isRecurring,
    });
    setSaving(false);
  };

  return (
    <div className="db-modal-overlay" onClick={onClose}>
      <div className="db-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="db-modal__title">
          {reminder ? 'Edit Reminder' : 'Add Reminder'}
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="db-field">
            <label className="db-label">Title</label>
            <input
              className="db-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Take morning medication"
              required
            />
          </div>
          <div className="db-field">
            <label className="db-label">Description (optional)</label>
            <textarea
              className="db-input db-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any additional details..."
            />
          </div>
          <div className="db-field">
            <label className="db-label">Frequency</label>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.9rem' }}>
                <input
                  type="radio"
                  name="frequency"
                  checked={isRecurring}
                  onChange={() => setIsRecurring(true)}
                />
                Daily
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.9rem' }}>
                <input
                  type="radio"
                  name="frequency"
                  checked={!isRecurring}
                  onChange={() => setIsRecurring(false)}
                />
                One-time
              </label>
            </div>
          </div>
          <div className="db-modal__actions">
            <button type="button" className="db-btn db-btn--secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="db-btn db-btn--primary" disabled={saving || !title.trim()}>
              {saving ? 'Saving...' : reminder ? 'Save Changes' : 'Add Reminder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
