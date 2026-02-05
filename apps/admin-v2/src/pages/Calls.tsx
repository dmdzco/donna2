import { useState, useEffect } from 'react';
import { api, type Call } from '@/lib/api';
import { cn, formatDate, formatDuration } from '@/lib/utils';
import Modal from '@/components/Modal';

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  'no-answer': 'bg-red-100 text-red-800',
  'in-progress': 'bg-yellow-100 text-yellow-800',
};

export default function Calls() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);

  async function loadCalls() {
    try {
      const data = await api.calls.list();
      setCalls(data);
    } catch (e) {
      console.error('Failed to load calls', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCalls();
  }, []);

  if (loading) {
    return <p className="text-center py-10 text-admin-text-muted">Loading calls...</p>;
  }

  return (
    <div>
      <div className="bg-white rounded-xl p-5 mb-5 shadow-card">
        <h2 className="text-base font-bold text-admin-text-light border-b-2 border-admin-primary pb-2 mb-4">
          Call History ({calls.length})
        </h2>
        {calls.length ? (
          calls.map((c) => (
            <div key={c.id} className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 mb-3 flex justify-between items-center">
              <div>
                <h3 className="text-[15px] font-semibold">{c.seniorName || 'Unknown'}</h3>
                <p className="text-xs text-admin-text-muted">
                  {formatDate(c.startedAt)} &bull; {formatDuration(c.durationSeconds)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn('inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold', statusColors[c.status] || 'bg-gray-100 text-gray-600')}>
                  {c.status || 'unknown'}
                </span>
                {c.transcript?.length > 0 && (
                  <button
                    onClick={() => setSelectedCall(c)}
                    className="bg-gray-200 text-admin-text px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-300 transition-colors"
                  >
                    Transcript
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-center py-10 text-admin-text-muted">No calls yet</p>
        )}
      </div>

      {/* Transcript Modal */}
      <Modal
        open={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        title={`Transcript - ${selectedCall?.seniorName || 'Call'}`}
        maxWidth="700px"
      >
        <div className="space-y-3">
          {selectedCall?.transcript?.map((msg, i) => (
            <div key={i} className="flex flex-col">
              <span className="text-[11px] font-semibold text-admin-text-muted mb-0.5">
                {msg.role === 'assistant' ? 'Donna' : 'User'}
              </span>
              <div
                className={cn(
                  'rounded-lg px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%]',
                  msg.role === 'assistant'
                    ? 'bg-[#e8e8ff] text-admin-text'
                    : 'bg-[#f0f0f0] text-admin-text'
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {(!selectedCall?.transcript || selectedCall.transcript.length === 0) && (
            <p className="text-center py-10 text-admin-text-muted">No transcript available</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
