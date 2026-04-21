import { StrictMode, lazy, Suspense } from 'react'
import { hydrateRoot, createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.jsx'

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const container = document.getElementById('root');
const path = typeof window !== 'undefined' ? window.location.pathname : '/';

const isSignupRoute = path.toLowerCase().startsWith('/signup');

const app = (
  <StrictMode>
    {isSignupRoute && CLERK_KEY ? (
      <ClerkProvider publishableKey={CLERK_KEY}>
        <App path={path} />
      </ClerkProvider>
    ) : (
      <App path={path} />
    )}
  </StrictMode>
);

// If pre-rendered HTML exists, hydrate (preserves content, attaches events).
// Otherwise, create fresh root (dev mode fallback).
if (container.children.length > 0) {
  hydrateRoot(container, app);
} else {
  createRoot(container).render(app);
}
