import { useState, useEffect } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useDashboard } from './DashboardContext';

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export default function SettingsPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const { senior, setSenior, loading: ctxLoading, api } = useDashboard();

  // Senior profile form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipcode, setZipcode] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Notification prefs
  const [prefs, setPrefs] = useState(null);
  const [prefsLoading, setPrefsLoading] = useState(true);

  useEffect(() => {
    if (!senior) return;
    setName(senior.name || senior.seniorName || '');
    setPhone(senior.phone || senior.seniorPhone || '');
    setCity(senior.city || '');
    setState(senior.state || '');
    setZipcode(senior.zipcode || '');
  }, [senior]);

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
      setPrefsLoading(false);
    }
  }

  const handleSaveProfile = async () => {
    if (!senior) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.updateSenior(senior.id, { name, phone, city, state, zipcode });
      setSenior((prev) => ({ ...prev, name, phone, city, state, zipcode }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

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

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (ctxLoading) {
    return <div className="db-loading"><div className="db-spinner" /></div>;
  }

  return (
    <div>
      <motion.div className="db-page__header" {...fadeUp}>
        <h1 className="db-page__title">Settings</h1>
      </motion.div>

      {/* Loved One Profile */}
      <motion.div className="db-card db-section" {...fadeUp} transition={{ delay: 0.1 }}>
        <h3 className="db-card__title">Loved One&apos;s Profile</h3>
        <div className="db-field">
          <label className="db-label">Name</label>
          <input className="db-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="db-field">
          <label className="db-label">Phone</label>
          <input className="db-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="db-field">
            <label className="db-label">City</label>
            <input className="db-input" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="db-field">
            <label className="db-label">State</label>
            <input className="db-input" value={state} onChange={(e) => setState(e.target.value)} />
          </div>
        </div>
        <div className="db-field">
          <label className="db-label">ZIP Code</label>
          <input className="db-input" value={zipcode} onChange={(e) => setZipcode(e.target.value)} style={{ maxWidth: 200 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="db-btn db-btn--primary db-btn--small"
            onClick={handleSaveProfile}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {saved && <span style={{ color: 'var(--color-sage)', fontSize: '0.85rem', fontWeight: 600 }}>Saved!</span>}
        </div>
      </motion.div>

      {/* Your Account */}
      <motion.div className="db-card db-section" {...fadeUp} transition={{ delay: 0.15 }}>
        <h3 className="db-card__title">Your Account</h3>
        <div className="db-field">
          <label className="db-label">Name</label>
          <input className="db-input" value={`${user?.firstName || ''} ${user?.lastName || ''}`.trim()} disabled style={{ opacity: 0.6 }} />
        </div>
        <div className="db-field" style={{ marginBottom: 0 }}>
          <label className="db-label">Email</label>
          <input className="db-input" value={user?.emailAddresses?.[0]?.emailAddress || ''} disabled style={{ opacity: 0.6 }} />
        </div>
      </motion.div>

      {/* Notification Preferences */}
      <motion.div className="db-card db-section" {...fadeUp} transition={{ delay: 0.2 }}>
        <h3 className="db-card__title">Notification Preferences</h3>
        {prefsLoading ? (
          <div className="db-loading" style={{ padding: 16 }}><div className="db-spinner" /></div>
        ) : (
          <div>
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
        )}
      </motion.div>

      {/* Sign Out */}
      <motion.div className="db-section" {...fadeUp} transition={{ delay: 0.25 }}>
        <button className="db-btn db-btn--danger" onClick={handleSignOut}>
          Sign Out
        </button>
      </motion.div>
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
