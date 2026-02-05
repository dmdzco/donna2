import { useState } from 'react';
import { SignOutButton } from '@clerk/clerk-react';
import {
  LayoutDashboard,
  User,
  Calendar,
  Bell,
  Settings,
  LogOut,
  Phone,
  ChevronRight
} from 'lucide-react';

// Placeholder - will be fully implemented in Task #6
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    { id: 'reminders', label: 'Reminders', icon: Bell },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-bg-cream flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 p-6 flex flex-col">
        <div className="mb-8">
          <span className="text-sage-green font-bold text-2xl">Donna</span>
        </div>

        {/* User mini-profile */}
        <div className="glass-card p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sage-green/20 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-sage-green" />
            </div>
            <div>
              <p className="font-medium text-sm">Caregiver</p>
              <p className="text-xs text-gray-500">Managing 1 senior</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                activeTab === tab.id
                  ? 'bg-sage-green text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Sign out */}
        <SignOutButton redirectUrl="/">
          <button className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:text-red-600 transition-colors">
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </SignOutButton>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <div>
              <h1 className="text-3xl font-bold">Good afternoon!</h1>
              <p className="text-gray-600">Here's how things are going with your loved one.</p>
            </div>

            {/* Quick Actions */}
            <div className="grid md:grid-cols-2 gap-4">
              <button className="glass-card p-6 text-left hover:shadow-float transition-shadow group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-accent-pink/20 rounded-full flex items-center justify-center">
                      <Phone className="w-6 h-6 text-accent-pink" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Instant Check-in</h3>
                      <p className="text-sm text-gray-500">Have Donna call right now</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-sage-green transition-colors" />
                </div>
              </button>

              <button
                onClick={() => setActiveTab('reminders')}
                className="glass-card p-6 text-left hover:shadow-float transition-shadow group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-sage-green/20 rounded-full flex items-center justify-center">
                      <Bell className="w-6 h-6 text-sage-green" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Edit Reminders</h3>
                      <p className="text-sm text-gray-500">Manage medication & appointments</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-sage-green transition-colors" />
                </div>
              </button>
            </div>

            {/* Recent Activity */}
            <div className="glass-card p-6">
              <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 bg-sage-green/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-sage-green" />
                  </div>
                  <div>
                    <p className="font-medium">Last Call - Yesterday at 10:30 AM</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Had a lovely conversation about the weather and upcoming doctor's appointment.
                      Mood was positive. No concerns noted.
                    </p>
                  </div>
                </div>
                <p className="text-center text-gray-500 text-sm">
                  Full activity history coming soon...
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab !== 'dashboard' && (
          <div className="glass-card p-8 text-center">
            <h2 className="text-2xl font-bold mb-4 capitalize">{activeTab}</h2>
            <p className="text-gray-500">This section is under construction.</p>
            <p className="text-sm text-gray-400 mt-2">Full implementation coming in Phase 4...</p>
          </div>
        )}
      </main>
    </div>
  );
}
