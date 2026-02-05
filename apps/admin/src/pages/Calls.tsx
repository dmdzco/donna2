import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api, formatDuration, type Conversation } from '@/lib/api';

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

function TranscriptModal({
  open,
  onClose,
  call,
}: {
  open: boolean;
  onClose: () => void;
  call: Conversation | null;
}) {
  if (!open || !call) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            Call with {call.seniorName || 'Unknown'} -{' '}
            {new Date(call.startedAt).toLocaleDateString()}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {!call.transcript?.length ? (
            <p className="text-gray-500 text-center py-8">
              No transcript available
            </p>
          ) : (
            call.transcript.map((message, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg ${
                  message.role === 'assistant'
                    ? 'bg-indigo-50'
                    : 'bg-gray-100'
                }`}
              >
                <div className="text-xs font-semibold text-gray-600 mb-1">
                  {message.role === 'assistant' ? 'Donna' : 'User'}
                </div>
                <div className="text-sm">{message.content}</div>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end pt-4 border-t mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Calls() {
  const [calls, setCalls] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<Conversation | null>(null);

  const loadCalls = async () => {
    try {
      const data = await api.calls.list();
      setCalls(data);
    } catch (error) {
      console.error('Failed to load calls:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalls();
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
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 border-b-2 border-indigo-500 pb-2 mb-4">
          Call History
        </h2>
        {!calls.length ? (
          <p className="text-gray-500 text-center py-8">No calls yet</p>
        ) : (
          <div className="space-y-3">
            {calls.map((call) => (
              <div
                key={call.id}
                className="flex justify-between items-start p-4 bg-gray-50 rounded-lg border border-gray-100"
              >
                <div>
                  <h3 className="font-medium text-gray-900">
                    {call.seniorName || 'Unknown'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {new Date(call.startedAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Duration: {formatDuration(call.durationSeconds)} &bull;{' '}
                    <StatusBadge status={call.status} />
                  </p>
                  {call.summary && (
                    <p className="text-sm text-gray-600 mt-2 italic">
                      {call.summary}
                    </p>
                  )}
                </div>
                <div>
                  {call.transcript && call.transcript.length > 0 ? (
                    <button
                      onClick={() => setSelectedCall(call)}
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                    >
                      View Transcript
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">No transcript</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <TranscriptModal
        open={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        call={selectedCall}
      />
    </div>
  );
}
