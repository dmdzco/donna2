import { useEffect, useState } from 'react';
import { Users, Phone, Bell, Activity } from 'lucide-react';
import { api, formatDate, formatDuration, type DashboardStats } from '@/lib/api';

function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType;
  value: string | number;
  label: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-50 rounded-lg">
          <Icon className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <div className="text-2xl font-bold text-indigo-600">{value}</div>
          <div className="text-sm text-gray-500">{label}</div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    'no-answer': 'bg-red-100 text-red-700',
    'in-progress': 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        styles[status] || 'bg-gray-100 text-gray-700'
      }`}
    >
      {status}
    </span>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    try {
      const data = await api.stats.get();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          value={stats?.totalSeniors ?? '-'}
          label="Seniors"
        />
        <StatCard
          icon={Phone}
          value={stats?.callsToday ?? '-'}
          label="Calls Today"
        />
        <StatCard
          icon={Bell}
          value={stats?.upcomingRemindersCount ?? '-'}
          label="Upcoming"
        />
        <StatCard
          icon={Activity}
          value={stats?.activeCalls ?? '-'}
          label="Active Calls"
        />
      </div>

      {/* Recent Calls */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 border-b-2 border-indigo-500 pb-2 mb-4">
          Recent Calls
        </h2>
        {!stats?.recentCalls?.length ? (
          <p className="text-gray-500 text-center py-8">No recent calls</p>
        ) : (
          <div className="space-y-3">
            {stats.recentCalls.map((call) => (
              <div
                key={call.id}
                className="flex justify-between items-start p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <h3 className="font-medium">{call.seniorName || 'Unknown'}</h3>
                  <p className="text-sm text-gray-500">
                    {formatDate(call.startedAt)} &bull;{' '}
                    {formatDuration(call.durationSeconds)}
                  </p>
                </div>
                <StatusBadge status={call.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Reminders */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 border-b-2 border-indigo-500 pb-2 mb-4">
          Upcoming Reminders
        </h2>
        {!stats?.upcomingReminders?.length ? (
          <p className="text-gray-500 text-center py-8">No upcoming reminders</p>
        ) : (
          <div className="space-y-3">
            {stats.upcomingReminders.map((reminder) => (
              <div
                key={reminder.id}
                className="flex justify-between items-start p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <h3 className="font-medium">{reminder.title}</h3>
                  <p className="text-sm text-gray-600">
                    {reminder.seniorName} &bull; {reminder.type}
                  </p>
                  <p className="text-xs text-gray-500">
                    {reminder.scheduledTime
                      ? new Date(reminder.scheduledTime).toLocaleString()
                      : '-'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
