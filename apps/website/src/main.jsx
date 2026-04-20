import { StrictMode } from 'react'
import { hydrateRoot, createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const container = document.getElementById('root');
const path = typeof window !== 'undefined' ? window.location.pathname : '/';
const app = (
  <StrictMode>
    <App path={path} />
  </StrictMode>
);

// If pre-rendered HTML exists, hydrate (preserves content, attaches events).
// Otherwise, create fresh root (dev mode fallback).
if (container.children.length > 0) {
  hydrateRoot(container, app);
} else {
  createRoot(container).render(app);
}
