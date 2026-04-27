import { useState, useEffect } from 'react';
import { useDashboard } from './DashboardContext';
import WeekStrip from './components/WeekStrip';
import MonthPicker from './components/MonthPicker';
import ScheduleCallCard from './components/ScheduleCallCard';
import ScheduleCallModal from './components/ScheduleCallModal';

const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

  const navigateWeek = (delta) => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta * 7);
      return d;
    });
  };

  const handleMonthSelect = (date) => {
    setSelectedDate(date);
  };

  if (ctxLoading || loading) {
    return <div className="db-loading"><div className="db-spinner" /></div>;
  }

  const selectedDayName = DAYS_FULL[selectedDate.getDay()];
  const callsForDay = calls
    .map((c, i) => ({ ...c, _index: i }))
    .filter((c) => c.days?.includes(selectedDayName) || c.frequency === 'daily');

  const scheduledDays = new Set();
  for (const call of calls) {
    if (call.frequency === 'daily') {
      DAYS_FULL.forEach((d) => scheduledDays.add(d));
    } else if (call.days) {
      call.days.forEach((d) => scheduledDays.add(d));
    }
  }

  return (
    <div>
      <div
        className="db-page__header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <h1 className="db-page__title">Schedule</h1>
        <button className="db-btn db-btn--primary db-btn--small" onClick={handleAdd}>
          Add Call
        </button>
      </div>

      <MonthPicker currentDate={selectedDate} onSelectMonth={handleMonthSelect} />

      <WeekStrip
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        scheduledDays={scheduledDays}
        onPrevWeek={() => navigateWeek(-1)}
        onNextWeek={() => navigateWeek(1)}
      />

      <div className="db-section">
        <h2 className="db-section__title">
          {selectedDayName}
        </h2>
        {callsForDay.length === 0 ? (
          <div className="db-empty">
            <p className="db-empty__text">No calls scheduled for {selectedDayName}.</p>
            <button className="db-btn db-btn--primary db-btn--small" onClick={handleAdd}>
              Schedule a Call
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
