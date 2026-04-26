import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckIcon } from './icons';

export default function Success({ data }) {
  // Clear onboarding localStorage so returning to /signup doesn't show this page
  useEffect(() => {
    try { localStorage.removeItem('donna_onboarding'); } catch {}
  }, []);

  const selectedInterests = Object.entries(data.interests || {})
    .filter(([, v]) => v.selected)
    .map(([k]) => k)
    .join(', ');

  const callSummary = (data.calls || [])
    .map((c) => c.title || 'Call')
    .join(', ');

  return (
    <div className="ob-success">
      <motion.div
        className="ob-success__check"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
      >
        <CheckIcon size={36} />
      </motion.div>

      <motion.h1
        className="ob-success__title"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        You&apos;re all set!
      </motion.h1>

      <motion.p
        className="ob-success__subtitle"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        Donna is ready to start calling {data.lovedOneName || 'your loved one'}.
        You can manage everything from your dashboard or the mobile app.
      </motion.p>

      <motion.div
        className="ob-success__card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        {data.lovedOneName && (
          <div className="ob-success__card-row">
            <span className="ob-success__card-label">Loved one</span>
            <span className="ob-success__card-value">{data.lovedOneName}</span>
          </div>
        )}
        {data.city && (
          <div className="ob-success__card-row">
            <span className="ob-success__card-label">Location</span>
            <span className="ob-success__card-value">{data.city}, {data.state}</span>
          </div>
        )}
        <div className="ob-success__card-row">
          <span className="ob-success__card-label">Language</span>
          <span className="ob-success__card-value" style={{ textTransform: 'capitalize' }}>{data.language}</span>
        </div>
        {selectedInterests && (
          <div className="ob-success__card-row">
            <span className="ob-success__card-label">Interests</span>
            <span className="ob-success__card-value" style={{ textTransform: 'capitalize' }}>{selectedInterests}</span>
          </div>
        )}
        {callSummary && (
          <div className="ob-success__card-row">
            <span className="ob-success__card-label">Calls</span>
            <span className="ob-success__card-value">{callSummary}</span>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <a href="/dashboard" className="ob-success__btn">
          Go to Dashboard
        </a>
      </motion.div>
    </div>
  );
}
