import { useAuth } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';

export default function AuthGuard({ children }) {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--color-cream)',
      }}>
        <div className="db-spinner" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/signup" replace />;
  }

  return children;
}
