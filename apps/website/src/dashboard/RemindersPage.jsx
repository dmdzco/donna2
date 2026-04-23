import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useDashboard } from './DashboardContext';
import ReminderCard from './components/ReminderCard';
import ReminderModal from './components/ReminderModal';

export default function RemindersPage() {
  const { senior, loading: ctxLoading, api } = useDashboard();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);

  useEffect(() => {
    if (!senior) return;
    loadReminders();
  }, [senior]);

  async function loadReminders() {
    try {
      const data = await api.getReminders();
      setReminders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load reminders:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleAdd = () => {
    setEditingReminder(null);
    setModalOpen(true);
  };

  const handleEdit = (reminder) => {
    setEditingReminder(reminder);
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this reminder?')) return;
    try {
      await api.deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert('Failed to delete reminder: ' + err.message);
    }
  };

  const handleSave = async (data) => {
    try {
      if (editingReminder) {
        const updated = await api.updateReminder(editingReminder.id, data);
        setReminders((prev) => prev.map((r) => (r.id === editingReminder.id ? { ...r, ...updated, ...data } : r)));
      } else {
        const created = await api.createReminder({ ...data, seniorId: senior.id });
        setReminders((prev) => [...prev, created]);
      }
      setModalOpen(false);
      setEditingReminder(null);
    } catch (err) {
      alert('Failed to save reminder: ' + err.message);
    }
  };

  if (ctxLoading || loading) {
    return <div className="db-loading"><div className="db-spinner" /></div>;
  }

  const filtered = reminders.filter((r) =>
    tab === 'active' ? r.isActive !== false : r.isActive === false
  );

  return (
    <div>
      <motion.div
        className="db-page__header"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div>
          <h1 className="db-page__title">Reminders</h1>
          <p className="db-page__subtitle">Manage reminders for {senior?.name || senior?.seniorName}</p>
        </div>
        <button className="db-btn db-btn--primary db-btn--small" onClick={handleAdd}>
          + Add Reminder
        </button>
      </motion.div>

      <div className="db-pills">
        <button
          className={`db-pill ${tab === 'active' ? 'db-pill--active' : ''}`}
          onClick={() => setTab('active')}
        >
          Active
        </button>
        <button
          className={`db-pill ${tab === 'completed' ? 'db-pill--active' : ''}`}
          onClick={() => setTab('completed')}
        >
          Completed
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="db-empty">
          <div className="db-empty__icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
          </div>
          <p className="db-empty__text">
            {tab === 'active'
              ? 'No active reminders. Add one to help Donna remember important things.'
              : 'No completed reminders yet.'}
          </p>
          {tab === 'active' && (
            <button className="db-btn db-btn--primary db-btn--small" onClick={handleAdd}>
              + Add Reminder
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              onEdit={() => handleEdit(reminder)}
              onDelete={() => handleDelete(reminder.id)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <ReminderModal
          reminder={editingReminder}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditingReminder(null); }}
        />
      )}
    </div>
  );
}
