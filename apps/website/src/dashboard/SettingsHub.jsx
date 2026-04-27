import { useClerk } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from './DashboardContext';
import SettingsRow from './components/SettingsRow';

export default function SettingsHub() {
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const { senior } = useDashboard();
  const seniorName = senior?.name || senior?.seniorName || 'Loved One';

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
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

      <div style={{ marginTop: 32 }}>
        <button className="db-btn db-btn--danger-text" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
