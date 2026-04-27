import { useState } from 'react';

export default function InstantCallModal({ senior, api, onClose }) {
  const [calling, setCalling] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleCall = async () => {
    setCalling(true);
    setError(null);
    try {
      await api.initiateCall({ seniorId: senior.id });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to initiate call');
    } finally {
      setCalling(false);
    }
  };

  const seniorName = senior?.name || senior?.seniorName || 'Loved One';

  return (
    <div className="db-modal-overlay" onClick={onClose}>
      <div className="db-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="db-modal__title">
          {success ? 'Call Initiated!' : `Call ${seniorName}`}
        </h2>

        {success ? (
          <div>
            <p style={{ color: 'var(--fg-2)', lineHeight: 1.6, marginBottom: 24 }}>
              Donna is now calling {seniorName}. The call will begin shortly.
            </p>
            <div className="db-modal__actions">
              <button className="db-btn db-btn--primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--fg-2)', lineHeight: 1.6, marginBottom: 24 }}>
              Donna will call {seniorName} right now for a friendly check-in conversation.
            </p>

            {error && (
              <div style={{
                color: 'var(--color-danger)',
                fontSize: 14,
                marginBottom: 16,
                padding: 12,
                background: 'var(--color-rose-bg)',
                borderRadius: 'var(--radius-md)',
              }}>
                {error}
              </div>
            )}

            <div className="db-modal__actions">
              <button className="db-btn db-btn--ghost" onClick={onClose} disabled={calling}>
                Cancel
              </button>
              <button className="db-btn db-btn--primary" onClick={handleCall} disabled={calling}>
                {calling ? 'Calling...' : 'Call Now'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
