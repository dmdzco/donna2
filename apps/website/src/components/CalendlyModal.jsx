import { motion, AnimatePresence } from 'framer-motion';
import './CalendlyModal.css';

export default function CalendlyModal({ isOpen, onClose }) {
  // TODO: Replace with real Calendly URL
  // import { InlineWidget } from 'react-calendly';
  // <InlineWidget url="https://calendly.com/nicholas-donna/intro" />

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="calendly-modal"
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal__close" onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <h2 className="modal__title">Meet Nicholas</h2>
            <p className="modal__subtitle">
              Book a free 15-minute intro call. No pressure — just a friendly chat about
              how Donna can help your family.
            </p>

            <div className="calendly-placeholder">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#5F7464" strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <p>Calendly booking widget will appear here</p>
              <span className="calendly-placeholder__note">
                Connect your Calendly account to enable scheduling
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
