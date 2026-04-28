import { useState } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from './DashboardContext';
import SettingsRow from './components/SettingsRow';

export default function SettingsHub() {
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const { senior, api } = useDashboard();
  const seniorName = senior?.name || senior?.seniorName || 'Loved One';

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await api.deleteAccount();
      await signOut();
      navigate('/');
    } catch (err) {
      alert('Failed to delete account: ' + err.message);
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <div>
      <div className="db-page__header">
        <h1 className="db-page__title">Settings</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <SettingsRow
          to="/dashboard/settings/loved-one"
          label={`${seniorName}'s Profile`}
          iconBg="var(--color-rose)"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
          }
        />
        <SettingsRow
          to="/dashboard/settings/account"
          label="Your Account"
          iconBg="var(--color-sage-dark)"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          }
        />
        <SettingsRow
          to="/dashboard/settings/notifications"
          label="Notifications"
          iconBg="var(--color-sage-dark)"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
          }
        />
        <SettingsRow
          to="/dashboard/settings/help"
          label="Help Center"
          iconBg="var(--color-cream-deep)"
          iconColor="var(--fg-2)"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        />
      </div>

      <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="db-btn db-btn--danger-text" onClick={handleSignOut}>
          Sign Out
        </button>
        <button className="db-btn db-btn--danger-text" onClick={() => setShowDeleteModal(true)}>
          Delete Account
        </button>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="db-modal-overlay" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="db-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="db-modal__title">Delete Account</h2>
            <p style={{ fontSize: 15, color: 'var(--fg-2)', lineHeight: 1.6, marginBottom: 8 }}>
              Are you sure you want to delete your account? This action is permanent and cannot be undone.
            </p>
            <p style={{ fontSize: 14, color: 'var(--color-danger)', lineHeight: 1.5 }}>
              All of your data will be permanently removed, including your loved one&apos;s profile, call history, reminders, and conversation memories.
            </p>
            <div className="db-modal__actions">
              <button
                className="db-btn db-btn--ghost"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="db-btn"
                onClick={handleDeleteAccount}
                disabled={deleting}
                style={{
                  background: 'var(--color-danger)',
                  color: 'white',
                }}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
