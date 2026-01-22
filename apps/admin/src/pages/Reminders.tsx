import { useEffect, useState } from 'react';
import { Pill, Calendar, Pin, Trash2, Plus } from 'lucide-react';
import {
  api,
  formatDate,
  type Reminder,
  type Senior,
  type CreateReminderInput,
} from '@/lib/api';

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-5 right-5 px-4 py-3 rounded-lg text-white shadow-lg z-50 ${
        type === 'success' ? 'bg-green-500' : 'bg-red-500'
      }`}
    >
      {message}
    </div>
  );
}

const typeIcons: Record<string, React.ElementType> = {
  medication: Pill,
  appointment: Calendar,
  custom: Pin,
};

export default function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [seniors, setSeniors] = useState<Senior[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateReminderInput>({
    seniorId: '',
    type: 'medication',
    title: '',
    description: '',
    scheduledTime: '',
    isRecurring: false,
    cronExpression: '',
  });
  const [recurringType, setRecurringType] = useState<'once' | 'daily' | 'weekly'>(
    'once'
  );
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const loadData = async () => {
    try {
      const [remindersData, seniorsData] = await Promise.all([
        api.reminders.list(),
        api.seniors.list(),
      ]);
      setReminders(remindersData);
      setSeniors(seniorsData);
    } catch (error) {
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let scheduledTime: string | undefined;
    let cronExpression: string | undefined;
    let isRecurring = false;

    if (recurringType === 'daily') {
      isRecurring = true;
      cronExpression = '0 * * * *';
      const today = new Date();
      const [h, m] = time.split(':');
      today.setHours(parseInt(h), parseInt(m), 0, 0);
      scheduledTime = today.toISOString();
    } else if (recurringType === 'weekly') {
      isRecurring = true;
      cronExpression = 'weekly';
      const today = new Date();
      const [h, m] = time.split(':');
      today.setHours(parseInt(h), parseInt(m), 0, 0);
      scheduledTime = today.toISOString();
    } else if (date && time) {
      scheduledTime = new Date(`${date}T${time}`).toISOString();
    }

    try {
      await api.reminders.create({
        ...formData,
        scheduledTime,
        isRecurring,
        cronExpression,
      });
      showToast('Reminder added!', 'success');
      setFormData({
        seniorId: '',
        type: 'medication',
        title: '',
        description: '',
        scheduledTime: '',
        isRecurring: false,
        cronExpression: '',
      });
      setDate('');
      setTime('');
      setRecurringType('once');
      loadData();
    } catch (error) {
      showToast('Failed to add reminder', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this reminder?')) return;
    try {
      await api.reminders.delete(id);
      showToast('Reminder deleted', 'success');
      loadData();
    } catch (error) {
      showToast('Failed to delete', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Add Reminder Form */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 border-b-2 border-indigo-500 pb-2 mb-4">
          Add New Reminder
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Senior *
              </label>
              <select
                required
                value={formData.seniorId}
                onChange={(e) =>
                  setFormData({ ...formData, seniorId: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">Select senior...</option>
                {seniors.map((senior) => (
                  <option key={senior.id} value={senior.id}>
                    {senior.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    type: e.target.value as CreateReminderInput['type'],
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="medication">Medication</option>
                <option value="appointment">Appointment</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="e.g., Blood pressure medication"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Additional details..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time *
              </label>
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recurring
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="recurring"
                  checked={recurringType === 'once'}
                  onChange={() => setRecurringType('once')}
                  className="text-indigo-600"
                />
                <span className="text-sm">One-time</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="recurring"
                  checked={recurringType === 'daily'}
                  onChange={() => setRecurringType('daily')}
                  className="text-indigo-600"
                />
                <span className="text-sm">Daily</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="recurring"
                  checked={recurringType === 'weekly'}
                  onChange={() => setRecurringType('weekly')}
                  className="text-indigo-600"
                />
                <span className="text-sm">Weekly</span>
              </label>
            </div>
          </div>
          <button
            type="submit"
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:shadow-lg transition-shadow"
          >
            <Plus className="w-4 h-4" />
            Add Reminder
          </button>
        </form>
      </div>

      {/* Reminders List */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 border-b-2 border-indigo-500 pb-2 mb-4">
          Active Reminders
        </h2>
        {!reminders.length ? (
          <p className="text-gray-500 text-center py-8">No reminders yet</p>
        ) : (
          <div className="space-y-3">
            {reminders.map((reminder) => {
              const Icon = typeIcons[reminder.type] || Pin;
              const schedule = reminder.isRecurring
                ? reminder.cronExpression === '0 * * * *'
                  ? 'Daily'
                  : reminder.cronExpression || 'Recurring'
                : 'One-time';

              return (
                <div
                  key={reminder.id}
                  className="flex justify-between items-start p-4 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex gap-3">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <Icon className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {reminder.title}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {reminder.seniorName}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {schedule} &bull;{' '}
                        {reminder.scheduledTime
                          ? new Date(reminder.scheduledTime).toLocaleString()
                          : '-'}
                      </p>
                      {reminder.lastDeliveredAt && (
                        <p className="text-xs text-gray-400 mt-1">
                          Last delivered: {formatDate(reminder.lastDeliveredAt)}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(reminder.id)}
                    className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
