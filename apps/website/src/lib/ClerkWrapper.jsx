import { ClerkProvider } from '@clerk/clerk-react';
import { Outlet, useNavigate } from 'react-router-dom';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function ClerkWrapper() {
  const navigate = useNavigate();

  if (!CLERK_KEY) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        Clerk is not configured. Set VITE_CLERK_PUBLISHABLE_KEY in your .env file.
      </div>
    );
  }

  return (
    <ClerkProvider
      publishableKey={CLERK_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
    >
      <Outlet />
    </ClerkProvider>
  );
}
