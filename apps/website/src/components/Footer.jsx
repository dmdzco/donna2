import './Footer.css';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__inner">
          <div className="footer__brand">
            <span className="footer__logo">Donna</span>
            <p className="footer__tagline">
              A helpful digital assistant for your aging loved one.
            </p>
          </div>

          <div className="footer__links">
            <div className="footer__col">
              <h4 className="footer__col-title">Quick Links</h4>
              <a href="/#how-it-works">How it Works</a>
              <a href="/#about">Our Story</a>
              <a href="/#pricing">Pricing</a>
              <a href="/#faq">FAQ</a>
            </div>
            <div className="footer__col">
              <h4 className="footer__col-title">Legal</h4>
              <a href="/privacypolicy">Privacy Policy</a>
              <a href="/third-party">Third-Party Services</a>
              <a href="/termsofservice">Terms of Service</a>
            </div>
            <div className="footer__col">
              <h4 className="footer__col-title">Contact</h4>
              <a href="/support">Support</a>
              <a href="mailto:nick@calldonna.co">nick@calldonna.co</a>
              <a
                href="http://www.linkedin.com/in/nicholas-mehdi"
                target="_blank"
                rel="noopener noreferrer"
              >
                LinkedIn
              </a>
            </div>
          </div>
        </div>

        <div className="footer__bottom">
          <p>&copy; {year} Donna. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
