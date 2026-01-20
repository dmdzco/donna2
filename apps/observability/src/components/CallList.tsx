import { useCalls } from '../hooks/useApi';
import type { Call } from '../types';

interface CallListProps {
  onSelectCall: (call: Call) => void;
  selectedCallId?: string;
}

export function CallList({ onSelectCall, selectedCallId }: CallListProps) {
  const { calls, loading, error, refresh } = useCalls();

  if (loading) {
    return <div className="call-list loading">Loading calls...</div>;
  }

  if (error) {
    return (
      <div className="call-list error">
        <p>Error: {error}</p>
        <button onClick={refresh}>Retry</button>
      </div>
    );
  }

  return (
    <div className="call-list">
      <div className="call-list-header">
        <h2>Recent Calls</h2>
        <button onClick={refresh} className="refresh-btn">Refresh</button>
      </div>
      <div className="call-list-items">
        {calls.map((call) => (
          <CallListItem
            key={call.id}
            call={call}
            isSelected={call.id === selectedCallId}
            onClick={() => onSelectCall(call)}
          />
        ))}
        {calls.length === 0 && (
          <div className="no-calls">No calls found</div>
        )}
      </div>
    </div>
  );
}

interface CallListItemProps {
  call: Call;
  isSelected: boolean;
  onClick: () => void;
}

function CallListItem({ call, isSelected, onClick }: CallListItemProps) {
  const statusColors: Record<string, string> = {
    completed: '#22c55e',
    in_progress: '#3b82f6',
    failed: '#ef4444',
    no_answer: '#f59e0b',
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div
      className={`call-list-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="call-item-header">
        <span className="senior-name">{call.senior_name || 'Unknown'}</span>
        <span
          className="status-badge"
          style={{ backgroundColor: statusColors[call.status] || '#666' }}
        >
          {call.status.replace('_', ' ')}
        </span>
      </div>
      <div className="call-item-details">
        <span className="call-date">{formatDate(call.started_at)}</span>
        <span className="call-time">{formatTime(call.started_at)}</span>
        <span className="call-duration">{formatDuration(call.duration_seconds)}</span>
        <span className="turn-count">{call.turn_count || 0} turns</span>
      </div>
      {call.concerns && call.concerns.length > 0 && (
        <div className="call-concerns">
          <span className="concern-badge">{call.concerns.length} concerns</span>
        </div>
      )}
    </div>
  );
}
