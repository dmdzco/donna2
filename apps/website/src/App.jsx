import { useState, lazy, Suspense } from 'react';
import './App.css';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Timeline from './components/Timeline';
import Testimonials from './components/Testimonials';
import About from './components/About';
import Pricing from './components/Pricing';
import FAQ from './components/FAQ';
import Footer from './components/Footer';
import WaitlistModal from './components/WaitlistModal';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';

const OnboardingFlow = lazy(() => import('./onboarding/OnboardingFlow'));

function normalizePath(p) {
  if (!p) return '/';
  const clean = p.replace(/\/+$/, '').toLowerCase();
  return clean === '' ? '/' : clean;
}

function App({ path = '/' }) {
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const openWaitlist = () => setWaitlistOpen(true);

  const route = normalizePath(path);
  const isPrivacy = route === '/privacypolicy' || route === '/privacy';
  const isTerms = route === '/termsofservice' || route === '/terms';
  const isSignup = route === '/signup' || route.startsWith('/signup/');

  if (isSignup) {
    return (
      <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--color-cream)' }} />}>
        <OnboardingFlow />
      </Suspense>
    );
  }

  return (
    <>
      <Navbar onOpenWaitlist={openWaitlist} />
      {isPrivacy ? (
        <main><PrivacyPolicy /></main>
      ) : isTerms ? (
        <main><TermsOfService /></main>
      ) : (
        <main>
          <Hero onOpenWaitlist={openWaitlist} />
          <Timeline />
          <Testimonials />
          <About />
          <Pricing onOpenWaitlist={openWaitlist} />
          <FAQ />
        </main>
      )}
      <Footer />
      <WaitlistModal isOpen={waitlistOpen} onClose={() => setWaitlistOpen(false)} />
    </>
  );
}

export default App;
