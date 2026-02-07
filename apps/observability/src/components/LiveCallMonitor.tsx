import { useState, useEffect, useRef } from 'react';
import { useActiveCalls, useCallTimeline } from '../hooks/useApi';
import type { Call, TimelineEvent } from '../types';

export function LiveCallMonitor() {
  const { activeCalls, loading: loadingCalls } = useActiveCalls();
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const { timeline } = useCallTimeline(selectedCall?.id);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const liveEvents: TimelineEvent[] = timeline?.timeline || [];

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveEvents]);

  // Auto-select first active call
  useEffect(() => {
    if (activeCalls.length > 0 && !selectedCall) {
      setSelectedCall(activeCalls[0]);
    }
  }, [activeCalls, selectedCall]);

  return (
    <div className="live-monitor">
      <div className="live-header">
        <h2>Live Call Monitor</h2>
      </div>

      <div className="live-content">
        {/* Active Calls Sidebar */}
        <div className="active-calls-list">
          <h3>Active Calls ({activeCalls.length})</h3>
          {loadingCalls ? (
            <div className="loading-state">Loading...</div>
          ) : activeCalls.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📞</span>
              <p>No active calls</p>
              <p className="hint">Calls will appear here when in progress</p>
            </div>
          ) : (
            <div className="calls-list">
              {activeCalls.map((call) => (
                <div
                  key={call.id}
                  className={`active-call-item ${selectedCall?.id === call.id ? 'selected' : ''}`}
                  onClick={() => setSelectedCall(call)}
                >
                  <div className="call-senior">{call.senior_name || 'Unknown'}</div>
                  <div className="call-meta">
                    <span className="call-phone">{call.senior_phone}</span>
                    <span className="call-turns">{call.turn_count} turns</span>
                  </div>
                  <div className="call-duration">
                    <LiveDuration startedAt={call.started_at} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Event Stream */}
        <div className="live-stream">
          {selectedCall ? (
            <>
              <div className="stream-header">
                <h3>Live Stream: {selectedCall.senior_name}</h3>
                <span className="event-count">{liveEvents.length} events</span>
              </div>
              <div className="stream-events">
                {liveEvents.length === 0 ? (
                  <div className="waiting-state">
                    <span className="pulse">●</span>
                    <p>Waiting for events...</p>
                  </div>
                ) : (
                  liveEvents.map((event, index) => (
                    <LiveEventItem key={index} event={event} />
                  ))
                )}
                <div ref={eventsEndRef} />
              </div>
            </>
          ) : (
            <div className="no-selection-state">
              <p>Select an active call to view live events</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface LiveEventItemProps {
  event: TimelineEvent;
}

function LiveEventItem({ event }: LiveEventItemProps) {
  const config = getEventConfig(event.type);
  const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className={`live-event ${config.className}`}>
      <span className="event-icon">{config.icon}</span>
      <span className="event-time">{time}</span>
      <span className="event-type">{config.label}</span>
      <div className="event-preview">
        {renderEventPreview(event)}
      </div>
    </div>
  );
}

function renderEventPreview(event: TimelineEvent) {
  const data = event.data as Record<string, unknown>;

  switch (event.type) {
    case 'turn.transcribed':
    case 'turn.response':
      return <span className="content-preview">{truncate(String(data.content || ''), 80)}</span>;

    case 'observer.signal':
      return (
        <span className="signal-preview">
          <span className={`engagement engagement-${data.engagementLevel || data.engagement}`}>
            {String(data.engagementLevel || data.engagement || '')}
          </span>
          <span className={`emotion emotion-${data.emotionalState || data.emotion}`}>
            {String(data.emotionalState || data.emotion || '')}
          </span>
        </span>
      );

    case 'call.initiated':
    case 'call.connected':
    case 'call.ended':
      return <span className="status-preview">{event.type.split('.')[1]}</span>;

    default:
      return null;
  }
}

function getEventConfig(type: string) {
  const configs: Record<string, { label: string; icon: string; className: string }> = {
    'call.initiated': { label: 'Started', icon: '📞', className: 'event-call' },
    'call.connected': { label: 'Connected', icon: '✅', className: 'event-call' },
    'call.ended': { label: 'Ended', icon: '📴', className: 'event-call' },
    'turn.transcribed': { label: 'Senior', icon: '👤', className: 'event-senior' },
    'turn.response': { label: 'Donna', icon: '🤖', className: 'event-donna' },
    'observer.signal': { label: 'Observer', icon: '👁', className: 'event-observer' },
    'reminder.delivered': { label: 'Reminder', icon: '🔔', className: 'event-reminder' },
    'error.occurred': { label: 'Error', icon: '⚠️', className: 'event-error' },
  };
  return configs[type] || { label: type, icon: '•', className: '' };
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

interface LiveDurationProps {
  startedAt: string;
}

function LiveDuration({ startedAt }: LiveDurationProps) {
  const [duration, setDuration] = useState('0:00');

  useEffect(() => {
    const update = () => {
      const start = new Date(startedAt).getTime();
      const now = Date.now();
      const seconds = Math.floor((now - start) / 1000);
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      setDuration(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return <span className="duration">{duration}</span>;
}
