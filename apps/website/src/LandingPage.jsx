import Hero from './components/Hero';
import Timeline from './components/Timeline';
import Testimonials from './components/Testimonials';
import About from './components/About';
import Pricing from './components/Pricing';
import FAQ from './components/FAQ';
import { useOutletContext } from 'react-router-dom';

export default function LandingPage() {
  const { openWaitlist } = useOutletContext();

  return (
    <main>
      <Hero onOpenWaitlist={openWaitlist} />
      <Timeline />
      <Testimonials />
      <About />
      <Pricing onOpenWaitlist={openWaitlist} />
      <FAQ />
    </main>
  );
}
