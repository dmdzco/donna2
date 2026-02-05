import { useState, useEffect } from 'react';
import { api, type DashboardStats } from '@/lib/api';
import { cn, formatDate, formatDuration } from '@/lib/utils';
import { Users, Phone, Bell, Radio } from 'lucide-react';

const statIcons = [Users, Phone, Bell, Radio];

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  async function loadStats() {
    try {
      const data = await api.stats.get();
      setStats(data);
    } catch (e) {
      console.error('Failed to load dashboard', e);
    }
  }

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const statCards = stats
    ? [
        { label: 'Seniors', value: stats.totalSeniors },
        { label: 'Calls Today', value: stats.callsToday },
        { label: 'Upcoming', value: stats.upcomingRemindersCount },
        { label: 'Active Calls', value: stats.activeCalls },
      ]
    : [
        { label: 'Seniors', value: '-' },
        { label: 'Calls Today', value: '-' },
        { label: 'Upcoming', value: '-' },
        { label: 'Active Calls', value: '-' },
      ];

  const statusColors: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    'no-answer': 'bg-red-100 text-red-800',
    'in-progress': 'bg-yellow-100 text-yellow-800',
  };

  return (
    <div>
      {/* Stats Grid */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 mb-6">
        {statCards.map((stat, i) => {
          const Icon = statIcons[i];
          return (
            <div key={stat.label} className="bg-white rounded-xl p-5 text-center shadow-card">
              <Icon size={20} className="mx-auto mb-2 text-admin-primary" />
              <div className="text-3xl font-bold text-admin-primary">{stat.value}</div>
              <div className="text-sm text-admin-text-muted mt-1">{stat.label}</div>
            </div>
          );
        })}
      </div>

      {/* Recent Calls */}
      <div className="bg-white rounded-xl p-5 mb-5 shadow-card">
        <h2 className="text-base font-bold text-admin-text-light border-b-2 border-admin-primary pb-2 mb-4">
          Recent Calls
        </h2>
        {stats?.recentCalls?.length ? (
          stats.recentCalls.map((c, i) => (
            <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 mb-3 flex justify-between items-center">
              <div>
                <h3 className="text-[15px] font-semibold">{c.seniorName || 'Unknown'}</h3>
                <p className="text-xs text-admin-text-muted">{formatDate(c.startedAt)} &bull; {formatDuration(c.durationSeconds)}</p>
              </div>
              <span className={cn('inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold', statusColors[c.status] || 'bg-gray-100 text-gray-600')}>
                {c.status || 'unknown'}
              </span>
            </div>
          ))
        ) : (
          <p className="text-center py-10 text-admin-text-muted">No recent calls</p>
        )}
      </div>

      {/* Upcoming Reminders */}
      <div className="bg-white rounded-xl p-5 mb-5 shadow-card">
        <h2 className="text-base font-bold text-admin-text-light border-b-2 border-admin-primary pb-2 mb-4">
          Upcoming Reminders
        </h2>
        {stats?.upcomingReminders?.length ? (
          stats.upcomingReminders.map((r, i) => (
            <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 mb-3">
              <h3 className="text-[15px] font-semibold">{r.title}</h3>
              <p className="text-sm text-admin-text-light">{r.seniorName} &bull; {r.type}</p>
              <p className="text-xs text-admin-text-muted">{new Date(r.scheduledTime).toLocaleString()}</p>
            </div>
          ))
        ) : (
          <p className="text-center py-10 text-admin-text-muted">No upcoming reminders</p>
        )}
      </div>
    </div>
  );
}
