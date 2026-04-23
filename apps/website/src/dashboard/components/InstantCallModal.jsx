import { useState } from 'react';

export default function InstantCallModal({ senior, api, onClose }) {
  const [calling, setCalling] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleCall = async () => {
    setCalling(true);
    setError(null);
    try {
      await api.initiateCall({ phoneNumber: senior.phone || senior.seniorPhone });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to initiate call');
    } finally {
      setCalling(false);
    }
  };

  return (
    <div className="db-modal-overlay" onClick={onClose}>
      <div className="db-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="db-modal__title">
          {success ? 'Call Initiated!' : `Call ${senior?.name || senior?.seniorName || 'Loved One'}`}
        </h2>

        {success ? (
          <div>
            <p style={{ color: '#555', lineHeight: 1.6, marginBottom: 24 }}>
              Donna is now calling {senior?.name || senior?.seniorName}. The call will begin shortly.
            </p>
            <div className="db-modal__actions">
              <button className="db-btn db-btn--primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ color: '#555', lineHeight: 1.6, marginBottom: 24 }}>
              Donna will call {senior?.name || senior?.seniorName} right now for a friendly check-in conversation.
            </p>

            {error && (
              <div style={{ color: '#d44', fontSize: '0.9rem', marginBottom: 16, padding: '12px', background: 'rgba(221,68,68,0.05)', borderRadius: 8 }}>
                {error}
              </div>
            )}

            <div className="db-modal__actions">
              <button className="db-btn db-btn--secondary" onClick={onClose} disabled={calling}>
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
