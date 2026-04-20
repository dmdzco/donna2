import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import './Navbar.css';

export default function Navbar({ onOpenWaitlist }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div className="navbar__inner container">
        <a href="/" className="navbar__logo">Donna</a>

        <button
          className={`navbar__hamburger ${menuOpen ? 'open' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span />
          <span />
          <span />
        </button>

        <div className={`navbar__links ${menuOpen ? 'navbar__links--open' : ''}`}>
          <button
            className="navbar__close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <a href="/#how-it-works" onClick={() => setMenuOpen(false)}>How it Works</a>
          <a href="/#about" onClick={() => setMenuOpen(false)}>Our Story</a>
          <a href="/#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
          <button className="btn btn-primary navbar__cta" onClick={() => { setMenuOpen(false); onOpenWaitlist(); }}>
            Download App
          </button>
        </div>
      </div>
    </motion.nav>
  );
}
