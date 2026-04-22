import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { motion } from 'framer-motion';
import { useDashboard } from './DashboardContext';
import CallCard from './components/CallCard';
import InstantCallModal from './components/InstantCallModal';

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function HomePage() {
  const { user } = useUser();
  const { senior, loading: ctxLoading, api } = useDashboard();
  const [conversations, setConversations] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [callModalOpen, setCallModalOpen] = useState(false);

  useEffect(() => {
    if (!senior) return;
    let cancelled = false;
    async function load() {
      try {
        const [convos, sched] = await Promise.all([
          api.getConversations(senior.id),
          api.getSchedule(senior.id),
        ]);
        if (!cancelled) {
          setConversations(Array.isArray(convos) ? convos.slice(0, 5) : []);
          setSchedule(sched);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [senior]);

  if (ctxLoading || loading) {
    return <div className="db-loading"><div className="db-spinner" /></div>;
  }

  const firstName = user?.firstName || 'there';
  const seniorName = senior?.name || senior?.seniorName || 'your loved one';

  // Find next scheduled call
  const nextCall = getNextCall(schedule);

  return (
    <div>
      <motion.div className="db-page__header" {...fadeUp}>
        <h1 className="db-page__title">Hello, {firstName}</h1>
        <p className="db-page__subtitle">Here&apos;s how {seniorName} is doing</p>
      </motion.div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Next Call Card */}
        {nextCall && (
          <motion.div className="db-card db-card--sage" {...fadeUp} transition={{ delay: 0.1 }}>
            <div className="db-card__label">Next Call</div>
            <div className="db-card__title" style={{ fontSize: '1.25rem' }}>
              {nextCall.day} at {nextCall.time}
            </div>
            {nextCall.title && (
              <div style={{ opacity: 0.8, fontSize: '0.9rem', marginTop: 4 }}>{nextCall.title}</div>
            )}
          </motion.div>
        )}

        {/* Instant Call */}
        <motion.div {...fadeUp} transition={{ delay: 0.15 }}>
          <button
            className="db-btn db-btn--primary"
            style={{ width: '100%', padding: '16px 24px', fontSize: '1rem' }}
            onClick={() => setCallModalOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </svg>
            Call {seniorName} Now
          </button>
        </motion.div>

        {/* Recent Calls */}
        <motion.div className="db-section" {...fadeUp} transition={{ delay: 0.2 }}>
          <h2 className="db-section__title">Recent Calls</h2>
          {conversations.length === 0 ? (
            <div className="db-empty">
              <div className="db-empty__icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                </svg>
              </div>
              <p className="db-empty__text">No calls yet. Donna will start calling {seniorName} based on your schedule.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {conversations.map((convo) => (
                <CallCard key={convo.id} conversation={convo} />
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {callModalOpen && (
        <InstantCallModal
          senior={senior}
          api={api}
          onClose={() => setCallModalOpen(false)}
        />
      )}
    </div>
  );
}

function getNextCall(schedule) {
  if (!schedule?.preferredCallTimes) return null;
  const calls = schedule.preferredCallTimes;
  if (!Array.isArray(calls) || calls.length === 0) return null;

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const now = new Date();
  const currentDay = now.getDay();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  let best = null;
  let bestDistance = Infinity;

  for (const call of calls) {
    const callDays = call.days || [];
    for (const day of callDays) {
      const dayIdx = days.indexOf(day);
      if (dayIdx === -1) continue;

      const [h, m] = (call.time || '10:00').split(':').map(Number);
      const callMinutes = h * 60 + m;

      let distance = (dayIdx - currentDay) * 1440 + (callMinutes - currentTime);
      if (distance <= 0) distance += 7 * 1440;

      if (distance < bestDistance) {
        bestDistance = distance;
        best = {
          day: day,
          time: formatTime(call.time || '10:00'),
          title: call.title,
        };
      }
    }
  }

  return best;
}

function formatTime(time) {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}
