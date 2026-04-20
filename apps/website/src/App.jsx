import { useState } from 'react';
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
