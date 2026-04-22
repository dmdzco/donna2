import { StrictMode, lazy, Suspense } from 'react';
import { hydrateRoot, createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import MarketingLayout from './App.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import LandingPage from './LandingPage.jsx';

const ClerkWrapper = lazy(() => import('./lib/ClerkWrapper.jsx'));
const AuthGuard = lazy(() => import('./lib/AuthGuard.jsx'));
const OnboardingFlow = lazy(() => import('./onboarding/OnboardingFlow'));
const DashboardLayout = lazy(() => import('./dashboard/DashboardLayout.jsx'));
const HomePage = lazy(() => import('./dashboard/HomePage.jsx'));
const RemindersPage = lazy(() => import('./dashboard/RemindersPage.jsx'));
const SchedulePage = lazy(() => import('./dashboard/SchedulePage.jsx'));
const SettingsPage = lazy(() => import('./dashboard/SettingsPage.jsx'));

const clerkFallback = <div style={{ minHeight: '100vh', background: 'var(--color-cream)' }} />;

const router = createBrowserRouter([
  {
    path: '/',
    element: <MarketingLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'privacypolicy', element: <main><PrivacyPolicy /></main> },
      { path: 'privacy', element: <main><PrivacyPolicy /></main> },
      { path: 'termsofservice', element: <main><TermsOfService /></main> },
      { path: 'terms', element: <main><TermsOfService /></main> },
    ],
  },
  {
    path: '/signup',
    element: (
      <Suspense fallback={clerkFallback}>
        <ClerkWrapper />
      </Suspense>
    ),
    children: [
      {
        path: '*',
        element: (
          <Suspense fallback={clerkFallback}>
            <OnboardingFlow />
          </Suspense>
        ),
      },
      {
        index: true,
        element: (
          <Suspense fallback={clerkFallback}>
            <OnboardingFlow />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '/dashboard',
    element: (
      <Suspense fallback={clerkFallback}>
        <ClerkWrapper />
      </Suspense>
    ),
    children: [
      {
        element: (
          <Suspense fallback={clerkFallback}>
            <AuthGuard>
              <DashboardLayout />
            </AuthGuard>
          </Suspense>
        ),
        children: [
          { index: true, element: <Suspense fallback={clerkFallback}><HomePage /></Suspense> },
          { path: 'reminders', element: <Suspense fallback={clerkFallback}><RemindersPage /></Suspense> },
          { path: 'schedule', element: <Suspense fallback={clerkFallback}><SchedulePage /></Suspense> },
          { path: 'settings', element: <Suspense fallback={clerkFallback}><SettingsPage /></Suspense> },
        ],
      },
    ],
  },
]);

const container = document.getElementById('root');

const app = (
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

if (container.children.length > 0) {
  hydrateRoot(container, app);
} else {
  createRoot(container).render(app);
}
