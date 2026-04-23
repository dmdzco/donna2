import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import './App.css';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import WaitlistModal from './components/WaitlistModal';

export default function MarketingLayout() {
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const openWaitlist = () => setWaitlistOpen(true);

  return (
    <>
      <Navbar onOpenWaitlist={openWaitlist} />
      <Outlet context={{ openWaitlist }} />
      <Footer />
      <WaitlistModal isOpen={waitlistOpen} onClose={() => setWaitlistOpen(false)} />
    </>
  );
}
