import { useCallTimeline } from '../hooks/useApi';
import type { TimelineEvent } from '../types';

interface CallTimelineProps {
  callId: string;
}

export function CallTimeline({ callId }: CallTimelineProps) {
  const { timeline, loading, error } = useCallTimeline(callId);

  if (loading) {
    return <div className="timeline loading">Loading timeline...</div>;
  }

  if (error) {
    return <div className="timeline error">Error: {error}</div>;
  }

  if (!timeline) {
    return <div className="timeline empty">No timeline data</div>;
  }

  return (
    <div className="timeline">
      <div className="timeline-header">
        <h3>Call Timeline</h3>
        <div className="timeline-meta">
          <span>Status: <strong>{timeline.status}</strong></span>
          {timeline.endedAt && (
            <span>Duration: <strong>{formatDuration(timeline.startedAt, timeline.endedAt)}</strong></span>
          )}
        </div>
      </div>
      <div className="timeline-events">
        {timeline.timeline.map((event, index) => (
          <TimelineEventItem key={index} event={event} startTime={timeline.startedAt} />
        ))}
      </div>
    </div>
  );
}

interface TimelineEventItemProps {
  event: TimelineEvent;
  startTime: string;
}

function TimelineEventItem({ event, startTime }: TimelineEventItemProps) {
  const eventConfig = getEventConfig(event.type);
  const offset = getTimeOffset(startTime, event.timestamp);

  return (
    <div className={`timeline-event ${eventConfig.className}`}>
      <div className="event-marker" style={{ backgroundColor: eventConfig.color }}>
        {eventConfig.icon}
      </div>
      <div className="event-content">
        <div className="event-header">
          <span className="event-type">{eventConfig.label}</span>
          <span className="event-time">{offset}</span>
        </div>
        <div className="event-body">
          {renderEventContent(event)}
        </div>
      </div>
    </div>
  );
}

function getEventConfig(type: string) {
  const configs: Record<string, { label: string; icon: string; color: string; className: string }> = {
    'call.initiated': { label: 'Call Started', icon: '📞', color: '#3b82f6', className: 'event-call' },
    'call.connected': { label: 'Connected', icon: '✅', color: '#22c55e', className: 'event-call' },
    'call.ended': { label: 'Call Ended', icon: '📴', color: '#6b7280', className: 'event-call' },
    'turn.transcribed': { label: 'Senior', icon: '👤', color: '#8b5cf6', className: 'event-turn-senior' },
    'turn.response': { label: 'Donna', icon: '🤖', color: '#06b6d4', className: 'event-turn-donna' },
    'observer.signal': { label: 'Observer', icon: '👁', color: '#f59e0b', className: 'event-observer' },
    'reminder.delivered': { label: 'Reminder', icon: '🔔', color: '#ec4899', className: 'event-reminder' },
    'error.occurred': { label: 'Error', icon: '⚠️', color: '#ef4444', className: 'event-error' },
  };
  return configs[type] || { label: type, icon: '•', color: '#666', className: 'event-unknown' };
}

function renderEventContent(event: TimelineEvent) {
  const data = event.data;

  switch (event.type) {
    case 'turn.transcribed':
    case 'turn.response':
      return (
        <div className="turn-content">
          <p className="turn-text">{String(data.content || '')}</p>
        </div>
      );

    case 'observer.signal':
      const signal = data as Record<string, unknown>;
      return (
        <div className="observer-signal-mini">
          <span className={`engagement engagement-${signal.engagementLevel || signal.engagement}`}>
            {String(signal.engagementLevel || signal.engagement || 'unknown')}
          </span>
          <span className={`emotion emotion-${signal.emotionalState || signal.emotion}`}>
            {String(signal.emotionalState || signal.emotion || 'unknown')}
          </span>
          {signal.confidenceScore !== undefined && (
            <span className="confidence">
              {Math.round(Number(signal.confidenceScore) * 100)}% conf
            </span>
          )}
          {Array.isArray(signal.concerns) && signal.concerns.length > 0 && (
            <span className="concerns-flag">⚠ {signal.concerns.length} concerns</span>
          )}
        </div>
      );

    case 'call.initiated':
      return (
        <div className="call-info">
          <span>Initiated by: {String(data.initiatedBy || 'unknown')}</span>
        </div>
      );

    case 'call.ended':
      return (
        <div className="call-info">
          <span>Status: {String(data.status || 'unknown')}</span>
          {data.durationSeconds !== undefined && (
            <span>Duration: {formatSeconds(Number(data.durationSeconds))}</span>
          )}
        </div>
      );

    default:
      return (
        <pre className="event-data">{JSON.stringify(data, null, 2)}</pre>
      );
  }
}

function getTimeOffset(startTime: string, eventTime: string): string {
  const start = new Date(startTime).getTime();
  const event = new Date(eventTime).getTime();
  const diffMs = event - start;
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 0) return '0:00';

  const mins = Math.floor(diffSeconds / 60);
  const secs = diffSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(startTime: string, endTime: string): string {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const diffSeconds = Math.floor((end - start) / 1000);
  return formatSeconds(diffSeconds);
}

function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
