import { renderToString } from 'react-dom/server';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import Hero from './components/Hero.jsx';
import Timeline from './components/Timeline.jsx';
import Testimonials from './components/Testimonials.jsx';
import About from './components/About.jsx';
import Pricing from './components/Pricing.jsx';
import FAQ from './components/FAQ.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import Support from './pages/Support.jsx';
import ThirdPartyServices from './pages/ThirdPartyServices.jsx';
import TermsOfService from './pages/TermsOfService.jsx';

const noop = () => {};

function MarketingShell({ children }) {
  return (
    <>
      <Navbar onOpenWaitlist={noop} />
      {children}
      <Footer />
    </>
  );
}

export function render(path = '/') {
  // Client-only routes
  if (path === '/signup' || path.startsWith('/dashboard')) {
    return '<div></div>';
  }

  if (path === '/privacypolicy') {
    return renderToString(
      <MarketingShell><main><PrivacyPolicy /></main></MarketingShell>
    );
  }

  if (path === '/support') {
    return renderToString(
      <MarketingShell><main><Support /></main></MarketingShell>
    );
  }

  if (path === '/third-party') {
    return renderToString(
      <MarketingShell><main><ThirdPartyServices /></main></MarketingShell>
    );
  }

  if (path === '/termsofservice') {
    return renderToString(
      <MarketingShell><main><TermsOfService /></main></MarketingShell>
    );
  }

  // Landing page (default)
  return renderToString(
    <MarketingShell>
      <main>
        <Hero onOpenWaitlist={noop} />
        <Timeline />
        <Testimonials />
        <About />
        <Pricing onOpenWaitlist={noop} />
        <FAQ />
      </main>
    </MarketingShell>
  );
}
