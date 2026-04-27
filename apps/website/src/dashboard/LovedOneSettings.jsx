import { useState, useEffect } from 'react';
import { useDashboard } from './DashboardContext';
import BackButton from './components/BackButton';

export default function LovedOneSettings() {
  const { senior, setSenior, loading: ctxLoading, api } = useDashboard();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipcode, setZipcode] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!senior) return;
    setName(senior.name || senior.seniorName || '');
    setPhone(senior.phone || senior.seniorPhone || '');
    setCity(senior.city || '');
    setState(senior.state || '');
    setZipcode(senior.zipcode || '');
  }, [senior]);

  const handleSave = async () => {
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

  if (ctxLoading) {
    return <div className="db-loading"><div className="db-spinner" /></div>;
  }

  return (
    <div>
      <BackButton />
      <div className="db-page__header">
        <h1 className="db-page__title">{senior?.name || 'Loved One'}&apos;s Profile</h1>
      </div>

      <div className="db-card" style={{ padding: 24 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <button
            className="db-btn db-btn--primary db-btn--wide"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
        {saved && (
          <div style={{ color: 'var(--color-success)', fontSize: 14, fontWeight: 600, marginTop: 12 }}>
            Saved!
          </div>
        )}
      </div>
    </div>
  );
}
