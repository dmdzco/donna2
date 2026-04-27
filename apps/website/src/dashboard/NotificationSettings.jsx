import { useState, useEffect } from 'react';
import { useDashboard } from './DashboardContext';
import BackButton from './components/BackButton';

export default function NotificationSettings() {
  const { api } = useDashboard();
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPrefs();
  }, []);

  async function loadPrefs() {
    try {
      const data = await api.getNotificationPrefs();
      setPrefs(data);
    } catch {
      setPrefs({ callSummaries: true, missedCallAlerts: true, completedCallAlerts: true, pauseCalls: false });
    } finally {
      setLoading(false);
    }
  }

  const togglePref = async (key) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    try {
      await api.updateNotificationPrefs(updated);
    } catch (err) {
      setPrefs(prefs);
      alert('Failed to update preference: ' + err.message);
    }
  };

  if (loading) {
    return <div className="db-loading"><div className="db-spinner" /></div>;
  }

  return (
    <div>
      <BackButton />
      <div className="db-page__header">
        <h1 className="db-page__title">Notifications</h1>
      </div>

      <div className="db-card" style={{ padding: 24 }}>
        <ToggleRow
          label="Call Summaries"
          description="Receive a summary after each call"
          checked={prefs?.callSummaries}
          onChange={() => togglePref('callSummaries')}
        />
        <ToggleRow
          label="Missed Call Alerts"
          description="Get notified when a scheduled call is missed"
          checked={prefs?.missedCallAlerts}
          onChange={() => togglePref('missedCallAlerts')}
        />
        <ToggleRow
          label="Completed Call Alerts"
          description="Get notified when a call is completed"
          checked={prefs?.completedCallAlerts}
          onChange={() => togglePref('completedCallAlerts')}
        />
        <ToggleRow
          label="Pause All Calls"
          description="Temporarily stop all scheduled calls"
          checked={prefs?.pauseCalls}
          onChange={() => togglePref('pauseCalls')}
        />
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="db-toggle">
      <div>
        <div className="db-toggle__label">{label}</div>
        {description && <div className="db-toggle__desc">{description}</div>}
      </div>
      <button
        className={`db-toggle__switch ${checked ? 'db-toggle__switch--on' : ''}`}
        onClick={onChange}
        type="button"
        aria-label={label}
      />
    </div>
  );
}
