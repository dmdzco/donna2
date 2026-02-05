import { useState, useEffect } from 'react';
import { api, type DailyContextEntry, type Senior } from '@/lib/api';

export default function DailyContext() {
  const [entries, setEntries] = useState<DailyContextEntry[]>([]);
  const [seniors, setSeniors] = useState<Senior[]>([]);
  const [seniorId, setSeniorId] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.seniors.list().then(setSeniors).catch(() => {});
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const params: { seniorId?: string; date?: string } = {};
      if (seniorId) params.seniorId = seniorId;
      if (date) params.date = date;
      const data = await api.dailyContext.list(params);
      setEntries(data);
    } catch (e) {
      console.error('Failed to load daily context', e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl p-5 mb-5 shadow-card">
      <h2 className="text-base font-bold text-admin-text-light border-b-2 border-admin-primary pb-2 mb-4">
        Daily Call Context
      </h2>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={seniorId}
          onChange={(e) => setSeniorId(e.target.value)}
          className="flex-1 px-3 py-2.5 border border-admin-border rounded-lg text-sm focus:outline-none focus:border-admin-primary transition-colors"
        >
          <option value="">All seniors</option>
          {seniors.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40 px-3 py-2.5 border border-admin-border rounded-lg text-sm focus:outline-none focus:border-admin-primary transition-colors"
        />
        <button
          onClick={loadData}
          className="bg-admin-accent hover:bg-admin-accent-hover text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:-translate-y-0.5 hover:shadow-card-hover transition-all"
        >
          Filter
        </button>
      </div>

      {/* Results */}
      {loading ? (
        <p className="text-center py-10 text-admin-text-muted">Loading...</p>
      ) : !entries.length ? (
        <p className="text-center py-10 text-admin-text-muted">No daily context entries</p>
      ) : (
        entries.map((c, i) => (
          <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 mb-3">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-[15px] font-semibold">{c.seniorName || 'Unknown'}</h3>
              <span className="text-xs text-admin-text-muted">
                {c.callDate ? new Date(c.callDate).toLocaleDateString() : '-'}
              </span>
            </div>

            {c.summary && (
              <p className="text-sm text-admin-text-light mb-2">{c.summary}</p>
            )}

            {c.topicsDiscussed?.length > 0 && (
              <div className="mb-1">
                <strong className="text-xs">Topics: </strong>
                {c.topicsDiscussed.map((t, j) => (
                  <span key={j} className="inline-block bg-admin-tag text-admin-primary px-2 py-0.5 rounded-full text-[11px] mr-1">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {c.remindersDelivered?.length > 0 && (
              <div className="mb-1">
                <strong className="text-xs">Reminders: </strong>
                {c.remindersDelivered.map((r, j) => (
                  <span key={j} className="inline-block bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-[11px] mr-1">
                    {r}
                  </span>
                ))}
              </div>
            )}

            {c.adviceGiven?.length > 0 && (
              <div className="mb-1">
                <strong className="text-xs">Advice: </strong>
                <span className="text-xs">{c.adviceGiven.join('; ')}</span>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
