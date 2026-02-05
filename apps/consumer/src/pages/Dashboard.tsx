import { useState, useEffect } from 'react';
import { useAuth, SignOutButton } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, User, Calendar, Bell, Settings, LogOut, Phone,
  ChevronRight, Plus, Trash2, Edit2, Check, X, Clock, CheckCircle2
} from 'lucide-react';
import './Dashboard.css';

interface Senior {
  id: string;
  name: string;
  phone: string;
  city?: string;
  state?: string;
  interests?: string[];
  preferredCallTimes?: {
    schedule?: { days: string[]; time: string };
    updateTopics?: string[];
  };
  role: string;
}

interface Reminder {
  id: string;
  title: string;
  description?: string;
  type: string;
  isActive: boolean;
  scheduledTime?: string;
}

interface Call {
  id: string;
  startedAt: string;
  endedAt?: string;
  summary?: string;
  sentiment?: string;
}

export default function Dashboard() {
  const { getToken, isLoaded } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [seniors, setSeniors] = useState<Senior[]>([]);
  const [activeSenior, setActiveSenior] = useState<Senior | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reminder editing state
  const [editingReminder, setEditingReminder] = useState<string | null>(null);
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [isAddingReminder, setIsAddingReminder] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || '';

  // Fetch user data on mount
  useEffect(() => {
    if (!isLoaded) return;

    const fetchData = async () => {
      try {
        const token = await getToken();
        if (!token) {
          navigate('/');
          return;
        }

        // Fetch caregiver's seniors
        const meRes = await fetch(`${API_URL}/api/caregivers/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!meRes.ok) {
          if (meRes.status === 404) {
            // Needs onboarding
            navigate('/onboarding');
            return;
          }
          throw new Error('Failed to load profile');
        }

        const meData = await meRes.json();
        setSeniors(meData.seniors || []);

        if (meData.seniors?.length > 0) {
          const senior = meData.seniors[0];
          setActiveSenior(senior);

          // Fetch reminders for this senior
          const remindersRes = await fetch(`${API_URL}/api/seniors/${senior.id}/reminders`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (remindersRes.ok) {
            setReminders(await remindersRes.json());
          }

          // Fetch calls for this senior
          const callsRes = await fetch(`${API_URL}/api/seniors/${senior.id}/calls`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (callsRes.ok) {
            setCalls(await callsRes.json());
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isLoaded, getToken, navigate, API_URL]);

  const handleAddReminder = async () => {
    if (!newReminderTitle.trim() || !activeSenior) return;

    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/seniors/${activeSenior.id}/reminders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newReminderTitle,
          type: 'custom',
        }),
      });

      if (res.ok) {
        const newReminder = await res.json();
        setReminders([...reminders, newReminder]);
        setNewReminderTitle('');
        setIsAddingReminder(false);
      }
    } catch (err) {
      console.error('Failed to add reminder:', err);
    }
  };

  const handleDeleteReminder = async (id: string) => {
    try {
      const token = await getToken();
      await fetch(`${API_URL}/api/reminders/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setReminders(reminders.filter(r => r.id !== id));
    } catch (err) {
      console.error('Failed to delete reminder:', err);
    }
  };

  const handleInitiateCall = async () => {
    if (!activeSenior) return;

    try {
      const token = await getToken();
      await fetch(`${API_URL}/api/seniors/${activeSenior.id}/calls`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Call initiated! Donna will call shortly.');
    } catch (err) {
      alert('Failed to initiate call. Please try again.');
    }
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${minutes} ${ampm}`;
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'reminders', label: 'Reminders', icon: Bell },
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <p>Error: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-circle">D</div>
          Donna
        </div>

        <nav className="nav-menu">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={20} />
              {tab.label}
            </div>
          ))}
        </nav>

        <div className="user-profile-mini">
          <div className="user-avatar-mini"></div>
          <div className="user-info-mini">
            <h4>{activeSenior?.name || 'Caregiver'}</h4>
            <span>Managing {seniors.length} senior{seniors.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <SignOutButton redirectUrl="/">
          <button className="signout-btn">
            <LogOut size={18} />
            Sign Out
          </button>
        </SignOutButton>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {activeTab === 'dashboard' && activeSenior && (
          <>
            <div className="dashboard-header">
              <h1>{getGreeting()}!</h1>
              <p>Here's how things are going with {activeSenior.name}.</p>
            </div>

            {/* Quick Actions */}
            <div className="actions-grid">
              <div className="action-card" onClick={handleInitiateCall}>
                <div className="action-icon pink">
                  <Phone size={24} />
                </div>
                <div className="action-card-content">
                  <h3>Instant Check-in</h3>
                  <p>Have Donna call {activeSenior.name} now</p>
                </div>
                <ChevronRight size={20} className="action-arrow" />
              </div>

              <div className="action-card" onClick={() => setActiveTab('reminders')}>
                <div className="action-icon green">
                  <Bell size={24} />
                </div>
                <div className="action-card-content">
                  <h3>Edit Reminders</h3>
                  <p>{reminders.length} active reminder{reminders.length !== 1 ? 's' : ''}</p>
                </div>
                <ChevronRight size={20} className="action-arrow" />
              </div>
            </div>

            {/* Content Grid */}
            <div className="content-grid">
              {/* Schedule Card */}
              <section className="calendar-card">
                <div className="section-header">
                  <h2>Call Schedule</h2>
                  <button className="edit-link" onClick={() => setActiveTab('schedule')}>Edit</button>
                </div>

                <div className="schedule-info">
                  {activeSenior.preferredCallTimes?.schedule ? (
                    <>
                      <div className="schedule-days">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                          <span
                            key={day}
                            className={`day-badge ${activeSenior.preferredCallTimes?.schedule?.days?.includes(day) ? 'active' : ''}`}
                          >
                            {day}
                          </span>
                        ))}
                      </div>
                      <p className="schedule-time">
                        <Clock size={16} />
                        Daily call at {formatTime(activeSenior.preferredCallTimes.schedule.time)}
                      </p>
                    </>
                  ) : (
                    <p className="no-schedule">No schedule configured</p>
                  )}
                </div>
              </section>

              {/* Recent Activity */}
              <section className="activity-card">
                <div className="section-header">
                  <h2>Recent Activity</h2>
                </div>

                <div className="activity-list">
                  {calls.length > 0 ? (
                    calls.slice(0, 3).map(call => (
                      <div key={call.id} className="activity-item">
                        <div className="activity-icon">
                          <CheckCircle2 size={18} />
                        </div>
                        <div className="activity-content">
                          <p className="activity-title">Call completed</p>
                          <p className="activity-time">
                            {new Date(call.startedAt).toLocaleDateString()} at{' '}
                            {new Date(call.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {call.summary && <p className="activity-summary">{call.summary}</p>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="no-activity">No recent calls yet</p>
                  )}
                </div>
              </section>
            </div>
          </>
        )}

        {activeTab === 'profile' && activeSenior && (
          <div className="profile-page">
            <h1>Profile</h1>
            <p className="page-description">Information about {activeSenior.name}</p>

            <div className="profile-card">
              <div className="profile-section">
                <h3>Basic Information</h3>
                <div className="profile-field">
                  <label>Name</label>
                  <p>{activeSenior.name}</p>
                </div>
                <div className="profile-field">
                  <label>Phone</label>
                  <p>{activeSenior.phone}</p>
                </div>
                {activeSenior.city && (
                  <div className="profile-field">
                    <label>Location</label>
                    <p>{activeSenior.city}, {activeSenior.state}</p>
                  </div>
                )}
              </div>

              {activeSenior.interests && activeSenior.interests.length > 0 && (
                <div className="profile-section">
                  <h3>Interests</h3>
                  <div className="interests-tags">
                    {activeSenior.interests.map((interest, i) => (
                      <span key={i} className="interest-tag">{interest}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reminders' && activeSenior && (
          <div className="reminders-page">
            <div className="page-header">
              <div>
                <h1>Reminders</h1>
                <p className="page-description">Manage daily reminders for {activeSenior.name}</p>
              </div>
              <button className="add-btn-primary" onClick={() => setIsAddingReminder(true)}>
                <Plus size={18} /> Add Reminder
              </button>
            </div>

            {isAddingReminder && (
              <div className="reminder-add-form">
                <input
                  type="text"
                  placeholder="Enter reminder (e.g., Take medication)"
                  value={newReminderTitle}
                  onChange={(e) => setNewReminderTitle(e.target.value)}
                  autoFocus
                />
                <div className="form-actions">
                  <button className="btn-save" onClick={handleAddReminder}>
                    <Check size={16} /> Save
                  </button>
                  <button className="btn-cancel" onClick={() => setIsAddingReminder(false)}>
                    <X size={16} /> Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="reminders-list">
              {reminders.length > 0 ? (
                reminders.map(reminder => (
                  <div key={reminder.id} className="reminder-item">
                    <div className="reminder-content">
                      <Bell size={18} className="reminder-icon" />
                      <div>
                        <p className="reminder-title">{reminder.title}</p>
                        {reminder.description && <p className="reminder-desc">{reminder.description}</p>}
                      </div>
                    </div>
                    <button className="delete-btn" onClick={() => handleDeleteReminder(reminder.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <Bell size={48} />
                  <p>No reminders yet</p>
                  <button onClick={() => setIsAddingReminder(true)}>Add your first reminder</button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'schedule' && activeSenior && (
          <div className="schedule-page">
            <h1>Call Schedule</h1>
            <p className="page-description">Configure when Donna calls {activeSenior.name}</p>

            <div className="schedule-card">
              <h3>Current Schedule</h3>
              {activeSenior.preferredCallTimes?.schedule ? (
                <>
                  <div className="schedule-days-large">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                      <div
                        key={day}
                        className={`day-toggle ${activeSenior.preferredCallTimes?.schedule?.days?.includes(day) ? 'active' : ''}`}
                      >
                        {day}
                      </div>
                    ))}
                  </div>
                  <p className="current-time">
                    Calls scheduled at <strong>{formatTime(activeSenior.preferredCallTimes.schedule.time)}</strong>
                  </p>
                </>
              ) : (
                <p>No schedule configured. Contact support to update.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="settings-page">
            <h1>Settings</h1>
            <p className="page-description">Manage your account settings</p>

            <div className="settings-card">
              <h3>Account</h3>
              <p>Account management features coming soon.</p>

              <div className="settings-section">
                <SignOutButton redirectUrl="/">
                  <button className="btn-danger">
                    <LogOut size={18} /> Sign Out
                  </button>
                </SignOutButton>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
