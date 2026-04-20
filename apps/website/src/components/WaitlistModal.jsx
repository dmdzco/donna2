import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './IntakeModal.css';

const API_URL = 'https://donna-api-production-2450.up.railway.app';
const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbw-q62iV6FO80cQhNdo-Ll1eXpZ0cY6PH4x0EXUG4HWf6aOFn0Mub9dmEhLTo5Amlw2/exec';

const WHO_FOR_OPTIONS = [
  'Mother',
  'Father',
  'Spouse',
  'Friend',
  'Other Loved One',
  'Client',
  'Myself',
];

export default function WaitlistModal({ isOpen, onClose }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [whoFor, setWhoFor] = useState('');
  const [thoughts, setThoughts] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const resetForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setWhoFor('');
    setThoughts('');
    setError('');
    setSubmitted(false);
  };

  const handleClose = () => {
    onClose();
    setTimeout(resetForm, 300);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const payload = JSON.stringify({ name, email, phone, whoFor, thoughts });

    try {
      // Fire both requests in parallel — success if either one works
      const results = await Promise.allSettled([
        fetch(`${API_URL}/waitlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        }).then((res) => { if (!res.ok) throw new Error('API failed'); }),
        fetch(GOOGLE_SHEET_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        }),
      ]);

      const anySucceeded = results.some((r) => r.status === 'fulfilled');
      if (anySucceeded) {
        setSubmitted(true);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="modal"
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal__close" onClick={handleClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {submitted ? (
              <div className="modal__success">
                <div className="modal__success-icon">
                  <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                    <circle cx="28" cy="28" r="28" fill="#5F7464" opacity="0.12" />
                    <path d="M20 28.5L26 34.5L37 22" stroke="#5F7464" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="modal__title">You&apos;re on the list!</h2>
                <p className="modal__subtitle">
                  We&apos;ll reach out as soon as Donna is ready. Thank you for your interest.
                </p>
                <button className="btn btn-primary modal__submit" onClick={handleClose}>
                  Close
                </button>
              </div>
            ) : (
              <>
                <h2 className="modal__title">Join the Waitlist</h2>
                <p className="modal__subtitle">
                  Donna is launching in the coming weeks. Sign up to be the first to try it.
                </p>

                <form className="modal__form" onSubmit={handleSubmit}>
                  <div className="modal__form-group">
                    <label htmlFor="wl-name">Name *</label>
                    <input
                      id="wl-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                    />
                  </div>

                  <div className="modal__form-group">
                    <label htmlFor="wl-email">Email *</label>
                    <input
                      id="wl-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com"
                    />
                  </div>

                  <div className="modal__form-group">
                    <label htmlFor="wl-phone">Phone <span style={{ color: '#999', fontWeight: 400 }}>(optional)</span></label>
                    <input
                      id="wl-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                    />
                  </div>

                  <div className="modal__form-group">
                    <label htmlFor="wl-who">Who is Donna for? <span style={{ color: '#999', fontWeight: 400 }}>(optional)</span></label>
                    <select
                      id="wl-who"
                      value={whoFor}
                      onChange={(e) => setWhoFor(e.target.value)}
                    >
                      <option value="">Select...</option>
                      {WHO_FOR_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>

                  <div className="modal__form-group">
                    <label htmlFor="wl-thoughts">Thoughts or questions? <span style={{ color: '#999', fontWeight: 400 }}>(optional)</span></label>
                    <textarea
                      id="wl-thoughts"
                      value={thoughts}
                      onChange={(e) => setThoughts(e.target.value)}
                      placeholder="Anything you'd like us to know..."
                      rows={3}
                    />
                  </div>

                  {error && (
                    <p style={{ color: '#d44', fontSize: '0.9rem' }}>{error}</p>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary modal__submit"
                    disabled={submitting}
                    style={submitting ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                  >
                    {submitting ? 'Submitting...' : 'Join the Waitlist'}
                  </button>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
