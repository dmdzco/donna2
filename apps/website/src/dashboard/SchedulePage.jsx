import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useDashboard } from './DashboardContext';
import ScheduleCalendar from './components/ScheduleCalendar';
import ScheduleCallCard from './components/ScheduleCallCard';
import ScheduleCallModal from './components/ScheduleCallModal';

export default function SchedulePage() {
  const { senior, loading: ctxLoading, api } = useDashboard();
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCall, setEditingCall] = useState(null);

  useEffect(() => {
    if (!senior) return;
    loadData();
  }, [senior]);

  async function loadData() {
    try {
      const sched = await api.getSchedule(senior.id);
      setSchedule(sched);
    } catch (err) {
      console.error('Failed to load schedule:', err);
    } finally {
      setLoading(false);
    }
  }

  const calls = schedule?.preferredCallTimes || [];

  const handleAdd = () => {
    setEditingCall(null);
    setModalOpen(true);
  };

  const handleEdit = (call, index) => {
    setEditingCall({ ...call, _index: index });
    setModalOpen(true);
  };

  const handleDelete = async (index) => {
    if (!confirm('Delete this scheduled call?')) return;
    const updated = calls.filter((_, i) => i !== index);
    try {
      await api.updateSchedule(senior.id, { preferredCallTimes: updated });
      setSchedule((prev) => ({ ...prev, preferredCallTimes: updated }));
    } catch (err) {
      alert('Failed to delete call: ' + err.message);
    }
  };

  const handleSave = async (callData) => {
    let updated;
    if (editingCall !== null && editingCall._index !== undefined) {
      updated = calls.map((c, i) => (i === editingCall._index ? callData : c));
    } else {
      updated = [...calls, callData];
    }
    try {
      await api.updateSchedule(senior.id, { preferredCallTimes: updated });
      setSchedule((prev) => ({ ...prev, preferredCallTimes: updated }));
      setModalOpen(false);
      setEditingCall(null);
    } catch (err) {
      alert('Failed to save call: ' + err.message);
    }
  };

  if (ctxLoading || loading) {
    return <div className="db-loading"><div className="db-spinner" /></div>;
  }

  // Get calls for selected day
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const selectedDayName = days[selectedDate.getDay()];
  const callsForDay = calls
    .map((c, i) => ({ ...c, _index: i }))
    .filter((c) => c.days?.includes(selectedDayName) || c.frequency === 'daily');

  // Get all scheduled day names for calendar dots
  const scheduledDays = new Set();
  for (const call of calls) {
    if (call.frequency === 'daily') {
      days.forEach((d) => scheduledDays.add(d));
    } else if (call.days) {
      call.days.forEach((d) => scheduledDays.add(d));
    }
  }

  return (
    <div>
      <motion.div
        className="db-page__header"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div>
          <h1 className="db-page__title">Schedule</h1>
          <p className="db-page__subtitle">Manage call schedule for {senior?.name || senior?.seniorName}</p>
        </div>
        <button className="db-btn db-btn--primary db-btn--small" onClick={handleAdd}>
          + Add Call
        </button>
      </motion.div>

      <ScheduleCalendar
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        scheduledDays={scheduledDays}
      />

      <div className="db-section" style={{ marginTop: 24 }}>
        <h2 className="db-section__title">
          Calls on {selectedDayName}
        </h2>
        {callsForDay.length === 0 ? (
          <div className="db-empty">
            <p className="db-empty__text">No calls scheduled for {selectedDayName}.</p>
            <button className="db-btn db-btn--primary db-btn--small" onClick={handleAdd}>
              + Schedule a Call
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {callsForDay.map((call) => (
              <ScheduleCallCard
                key={call._index}
                call={call}
                onEdit={() => handleEdit(call, call._index)}
                onDelete={() => handleDelete(call._index)}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <ScheduleCallModal
          call={editingCall}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditingCall(null); }}
        />
      )}
    </div>
  );
}
