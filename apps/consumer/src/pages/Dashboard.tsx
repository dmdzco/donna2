import { useState, useEffect } from 'react';
import { useAuth, SignOutButton } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, User, Calendar, Bell, Settings, LogOut, Phone,
  ChevronRight, Plus, Trash2, Check, X, Clock, CheckCircle2, Edit2, Save,
  ArrowLeft, ArrowRight
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

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

  // Reminder state
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [isAddingReminder, setIsAddingReminder] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [editingReminderTitle, setEditingReminderTitle] = useState('');

  // Add senior modal state
  const [showAddSenior, setShowAddSenior] = useState(false);
  const [addSeniorStep, setAddSeniorStep] = useState(1);
  const [isAddingSenior, setIsAddingSenior] = useState(false);
  const [newSeniorData, setNewSeniorData] = useState({
    name: '',
    phone: '',
    relation: 'Mother',
    city: '',
    state: '',
    reminders: [''],
    callDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    callTime: '10:00',
  });

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Partial<Senior>>({});

  // Schedule editing state
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [editedSchedule, setEditedSchedule] = useState<{ days: string[]; time: string }>({ days: [], time: '09:00' });

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

  const handleUpdateReminder = async (id: string, title: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/reminders/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title }),
      });

      if (res.ok) {
        setReminders(reminders.map(r => r.id === id ? { ...r, title } : r));
        setEditingReminderId(null);
        setEditingReminderTitle('');
      }
    } catch (err) {
      console.error('Failed to update reminder:', err);
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
      await fetch(`${API_URL}/api/call`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNumber: activeSenior.phone }),
      });
      alert('Call initiated! Donna will call shortly.');
    } catch (err) {
      alert('Failed to initiate call. Please try again.');
    }
  };

  const handleSaveProfile = async () => {
    if (!activeSenior) return;

    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/seniors/${activeSenior.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editedProfile),
      });

      if (res.ok) {
        const updated = await res.json();
        setActiveSenior(updated);
        setSeniors(seniors.map(s => s.id === updated.id ? updated : s));
        setIsEditingProfile(false);
      }
    } catch (err) {
      console.error('Failed to update profile:', err);
    }
  };

  const handleSaveSchedule = async () => {
    if (!activeSenior) return;

    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/seniors/${activeSenior.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          preferredCallTimes: {
            ...activeSenior.preferredCallTimes,
            schedule: editedSchedule,
          },
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setActiveSenior(updated);
        setSeniors(seniors.map(s => s.id === updated.id ? updated : s));
        setIsEditingSchedule(false);
      }
    } catch (err) {
      console.error('Failed to update schedule:', err);
    }
  };

  const handleSwitchSenior = async (senior: Senior) => {
    setActiveSenior(senior);
    try {
      const token = await getToken();
      const [remindersRes, callsRes] = await Promise.all([
        fetch(`${API_URL}/api/seniors/${senior.id}/reminders`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/seniors/${senior.id}/calls`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (remindersRes.ok) setReminders(await remindersRes.json());
      if (callsRes.ok) setCalls(await callsRes.json());
    } catch (err) {
      console.error('Failed to load senior data:', err);
    }
  };

  const resetAddSeniorModal = () => {
    setShowAddSenior(false);
    setAddSeniorStep(1);
    setNewSeniorData({
      name: '', phone: '', relation: 'Mother', city: '', state: '',
      reminders: [''], callDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], callTime: '10:00',
    });
  };

  const handleAddSenior = async () => {
    setIsAddingSenior(true);
    try {
      const token = await getToken();
      const payload = {
        senior: {
          name: newSeniorData.name,
          phone: newSeniorData.phone,
          city: newSeniorData.city,
          state: newSeniorData.state,
          timezone: 'America/New_York',
        },
        relation: newSeniorData.relation,
        interests: [],
        reminders: newSeniorData.reminders.filter(r => r.trim()),
        updateTopics: [],
        callSchedule: {
          days: newSeniorData.callDays,
          time: newSeniorData.callTime,
        },
        familyInfo: {
          relation: newSeniorData.relation,
          interestDetails: {},
        },
      };

      const res = await fetch(`${API_URL}/api/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to add senior' }));
        throw new Error(err.error || err.message || 'Failed to add');
      }

      const data = await res.json();
      const newSenior = { ...data.senior, role: newSeniorData.relation };
      setSeniors([...seniors, newSenior]);
      setActiveSenior(newSenior);
      setCalls([]);

      // Fetch reminders that were just created
      const remindersRes = await fetch(`${API_URL}/api/seniors/${data.senior.id}/reminders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (remindersRes.ok) setReminders(await remindersRes.json());
      else setReminders([]);

      resetAddSeniorModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add loved one');
    } finally {
      setIsAddingSenior(false);
    }
  };

  const startEditingProfile = () => {
    if (activeSenior) {
      setEditedProfile({
        name: activeSenior.name,
        phone: activeSenior.phone,
        city: activeSenior.city,
        state: activeSenior.state,
      });
      setIsEditingProfile(true);
    }
  };

  const startEditingSchedule = () => {
    if (activeSenior?.preferredCallTimes?.schedule) {
      setEditedSchedule({
        days: [...activeSenior.preferredCallTimes.schedule.days],
        time: activeSenior.preferredCallTimes.schedule.time,
      });
    } else {
      setEditedSchedule({ days: ['Mon', 'Wed', 'Fri'], time: '09:00' });
    }
    setIsEditingSchedule(true);
  };

  const toggleScheduleDay = (day: string) => {
    setEditedSchedule(prev => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter(d => d !== day)
        : [...prev.days, day],
    }));
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

        <div className="senior-switcher">
          <div className="senior-switcher-label">Your Loved Ones</div>
          {seniors.map((senior) => (
            <div
              key={senior.id}
              className={`senior-switcher-item ${activeSenior?.id === senior.id ? 'active' : ''}`}
              onClick={() => handleSwitchSenior(senior)}
            >
              <div className="senior-avatar">{senior.name.charAt(0)}</div>
              <div className="senior-switcher-info">
                <span className="senior-switcher-name">{senior.name}</span>
                <span className="senior-switcher-role">{senior.role}</span>
              </div>
            </div>
          ))}
          <button className="add-senior-btn" onClick={() => setShowAddSenior(true)}>
            <Plus size={16} />
            Add Loved One
          </button>
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
        {/* No Senior State */}
        {!activeSenior && (
          <div className="no-senior-state">
            <h1>No Senior Profile Found</h1>
            <p>It looks like you haven't completed the onboarding process yet.</p>
            <button className="add-btn-primary" onClick={() => navigate('/onboarding')}>
              Complete Onboarding
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && activeSenior && (
          <>
            <div className="dashboard-header">
              <h1>{getGreeting()}!</h1>
              <p>Here's how things are going with <strong>{activeSenior.name}</strong>.</p>
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
                        {DAYS_OF_WEEK.map(day => (
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
            <div className="page-header">
              <div>
                <h1>Profile</h1>
                <p className="page-description">Information about {activeSenior.name}</p>
              </div>
              {!isEditingProfile ? (
                <button className="add-btn-primary" onClick={startEditingProfile}>
                  <Edit2 size={18} /> Edit Profile
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn-save" onClick={handleSaveProfile}>
                    <Save size={16} /> Save
                  </button>
                  <button className="btn-cancel" onClick={() => setIsEditingProfile(false)}>
                    <X size={16} /> Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="profile-card">
              <div className="profile-section">
                <h3>Basic Information</h3>

                <div className="profile-field">
                  <label>Name</label>
                  {isEditingProfile ? (
                    <input
                      type="text"
                      value={editedProfile.name || ''}
                      onChange={(e) => setEditedProfile({ ...editedProfile, name: e.target.value })}
                      className="profile-input"
                    />
                  ) : (
                    <p>{activeSenior.name}</p>
                  )}
                </div>

                <div className="profile-field">
                  <label>Phone</label>
                  {isEditingProfile ? (
                    <input
                      type="tel"
                      value={editedProfile.phone || ''}
                      onChange={(e) => setEditedProfile({ ...editedProfile, phone: e.target.value })}
                      className="profile-input"
                    />
                  ) : (
                    <p>{activeSenior.phone}</p>
                  )}
                </div>

                <div className="profile-field">
                  <label>Location</label>
                  {isEditingProfile ? (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input
                        type="text"
                        placeholder="City"
                        value={editedProfile.city || ''}
                        onChange={(e) => setEditedProfile({ ...editedProfile, city: e.target.value })}
                        className="profile-input"
                        style={{ flex: 2 }}
                      />
                      <input
                        type="text"
                        placeholder="State"
                        value={editedProfile.state || ''}
                        onChange={(e) => setEditedProfile({ ...editedProfile, state: e.target.value })}
                        className="profile-input"
                        style={{ flex: 1 }}
                      />
                    </div>
                  ) : (
                    <p>{activeSenior.city ? `${activeSenior.city}, ${activeSenior.state}` : 'Not specified'}</p>
                  )}
                </div>
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
                      {editingReminderId === reminder.id ? (
                        <input
                          type="text"
                          value={editingReminderTitle}
                          onChange={(e) => setEditingReminderTitle(e.target.value)}
                          className="reminder-edit-input"
                          autoFocus
                        />
                      ) : (
                        <div>
                          <p className="reminder-title">{reminder.title}</p>
                          {reminder.description && <p className="reminder-desc">{reminder.description}</p>}
                        </div>
                      )}
                    </div>
                    <div className="reminder-actions">
                      {editingReminderId === reminder.id ? (
                        <>
                          <button
                            className="save-btn-small"
                            onClick={() => handleUpdateReminder(reminder.id, editingReminderTitle)}
                          >
                            <Check size={16} />
                          </button>
                          <button
                            className="cancel-btn-small"
                            onClick={() => {
                              setEditingReminderId(null);
                              setEditingReminderTitle('');
                            }}
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="edit-btn-small"
                            onClick={() => {
                              setEditingReminderId(reminder.id);
                              setEditingReminderTitle(reminder.title);
                            }}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button className="delete-btn" onClick={() => handleDeleteReminder(reminder.id)}>
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
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
            <div className="page-header">
              <div>
                <h1>Call Schedule</h1>
                <p className="page-description">Configure when Donna calls {activeSenior.name}</p>
              </div>
              {!isEditingSchedule ? (
                <button className="add-btn-primary" onClick={startEditingSchedule}>
                  <Edit2 size={18} /> Edit Schedule
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn-save" onClick={handleSaveSchedule}>
                    <Save size={16} /> Save
                  </button>
                  <button className="btn-cancel" onClick={() => setIsEditingSchedule(false)}>
                    <X size={16} /> Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="schedule-card">
              <h3>Call Days</h3>
              <p className="schedule-hint">Select which days Donna should call</p>

              <div className="schedule-days-large">
                {DAYS_OF_WEEK.map(day => (
                  <div
                    key={day}
                    className={`day-toggle ${
                      isEditingSchedule
                        ? editedSchedule.days.includes(day) ? 'active' : ''
                        : activeSenior.preferredCallTimes?.schedule?.days?.includes(day) ? 'active' : ''
                    } ${isEditingSchedule ? 'editable' : ''}`}
                    onClick={() => isEditingSchedule && toggleScheduleDay(day)}
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="schedule-time-section">
                <h3>Call Time</h3>
                {isEditingSchedule ? (
                  <input
                    type="time"
                    value={editedSchedule.time}
                    onChange={(e) => setEditedSchedule({ ...editedSchedule, time: e.target.value })}
                    className="time-input"
                  />
                ) : (
                  <p className="current-time">
                    Calls scheduled at <strong>
                      {activeSenior.preferredCallTimes?.schedule?.time
                        ? formatTime(activeSenior.preferredCallTimes.schedule.time)
                        : 'Not set'}
                    </strong>
                  </p>
                )}
              </div>
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

      {/* Add Senior Modal */}
      {showAddSenior && (
        <div className="modal-overlay" onClick={resetAddSeniorModal}>
          <div className="modal-content add-senior-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add a Loved One</h2>
              <button className="modal-close" onClick={resetAddSeniorModal}>
                <X size={20} />
              </button>
            </div>

            {addSeniorStep === 1 && (
              <div className="modal-body">
                <p className="modal-description">Who will Donna be calling?</p>

                <div className="modal-field">
                  <label>Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Martha"
                    value={newSeniorData.name}
                    onChange={(e) => setNewSeniorData({ ...newSeniorData, name: e.target.value })}
                    autoFocus
                  />
                </div>

                <div className="modal-field">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={newSeniorData.phone}
                    onChange={(e) => setNewSeniorData({ ...newSeniorData, phone: e.target.value })}
                  />
                </div>

                <div className="modal-field">
                  <label>Relationship</label>
                  <select
                    value={newSeniorData.relation}
                    onChange={(e) => setNewSeniorData({ ...newSeniorData, relation: e.target.value })}
                  >
                    <option>Mother</option>
                    <option>Father</option>
                    <option>Client</option>
                    <option>Other Loved One</option>
                  </select>
                </div>

                <div className="modal-field">
                  <label>Location</label>
                  <div className="modal-location-row">
                    <input
                      type="text"
                      placeholder="City"
                      value={newSeniorData.city}
                      onChange={(e) => setNewSeniorData({ ...newSeniorData, city: e.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="State"
                      value={newSeniorData.state}
                      onChange={(e) => setNewSeniorData({ ...newSeniorData, state: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {addSeniorStep === 2 && (
              <div className="modal-body">
                <p className="modal-description">Set up reminders and call schedule</p>

                <div className="modal-field">
                  <label>Daily Reminders</label>
                  {newSeniorData.reminders.map((reminder, index) => (
                    <input
                      key={index}
                      type="text"
                      placeholder={index === 0 ? "e.g. Take medication at 9am" : `Reminder ${index + 1}`}
                      value={reminder}
                      onChange={(e) => {
                        const updated = [...newSeniorData.reminders];
                        updated[index] = e.target.value;
                        setNewSeniorData({ ...newSeniorData, reminders: updated });
                      }}
                      style={{ marginBottom: '8px' }}
                    />
                  ))}
                  <button className="add-reminder-link" onClick={() => setNewSeniorData({ ...newSeniorData, reminders: [...newSeniorData.reminders, ''] })}>
                    <Plus size={14} /> Add another reminder
                  </button>
                </div>

                <div className="modal-field">
                  <label>Call Days</label>
                  <div className="modal-days-row">
                    {DAYS_OF_WEEK.map(day => (
                      <div
                        key={day}
                        className={`modal-day-toggle ${newSeniorData.callDays.includes(day) ? 'active' : ''}`}
                        onClick={() => {
                          const days = newSeniorData.callDays.includes(day)
                            ? newSeniorData.callDays.filter(d => d !== day)
                            : [...newSeniorData.callDays, day];
                          setNewSeniorData({ ...newSeniorData, callDays: days });
                        }}
                      >
                        {day}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="modal-field">
                  <label>Call Time</label>
                  <input
                    type="time"
                    value={newSeniorData.callTime}
                    onChange={(e) => setNewSeniorData({ ...newSeniorData, callTime: e.target.value })}
                    className="time-input"
                  />
                </div>
              </div>
            )}

            <div className="modal-footer">
              {addSeniorStep > 1 && (
                <button className="btn-cancel" onClick={() => setAddSeniorStep(addSeniorStep - 1)}>
                  <ArrowLeft size={16} /> Back
                </button>
              )}
              <div style={{ flex: 1 }} />
              {addSeniorStep === 1 ? (
                <button
                  className="add-btn-primary"
                  onClick={() => setAddSeniorStep(2)}
                  disabled={!newSeniorData.name || !newSeniorData.phone}
                >
                  Next <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  className="add-btn-primary"
                  onClick={handleAddSenior}
                  disabled={isAddingSenior}
                >
                  {isAddingSenior ? 'Adding...' : 'Add Loved One'} <Check size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
