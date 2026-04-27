import { useUser } from '@clerk/clerk-react';
import BackButton from './components/BackButton';

export default function AccountSettings() {
  const { user } = useUser();

  return (
    <div>
      <BackButton />
      <div className="db-page__header">
        <h1 className="db-page__title">Your Account</h1>
      </div>

      <div className="db-card" style={{ padding: 24 }}>
        <div className="db-field">
          <label className="db-label">Name</label>
          <input
            className="db-input"
            value={`${user?.firstName || ''} ${user?.lastName || ''}`.trim()}
            disabled
          />
        </div>
        <div className="db-field" style={{ marginBottom: 0 }}>
          <label className="db-label">Email</label>
          <input
            className="db-input"
            value={user?.emailAddresses?.[0]?.emailAddress || ''}
            disabled
          />
        </div>
      </div>
    </div>
  );
}
