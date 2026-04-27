import BackButton from './components/BackButton';

export default function HelpCenter() {
  return (
    <div>
      <BackButton />
      <div className="db-page__header">
        <h1 className="db-page__title">Help Center</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <a
          href="mailto:support@calldonna.co"
          className="db-srow"
          style={{ textDecoration: 'none' }}
        >
          <div className="db-srow__icon" style={{ background: 'var(--color-cream-deep)', color: 'var(--fg-2)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <span className="db-srow__label">Contact Support</span>
          <span className="db-srow__chevron">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </a>
        <a
          href="/privacy"
          className="db-srow"
          style={{ textDecoration: 'none' }}
        >
          <div className="db-srow__icon" style={{ background: 'var(--color-cream-deep)', color: 'var(--fg-2)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <span className="db-srow__label">Privacy Policy</span>
          <span className="db-srow__chevron">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </a>
        <a
          href="/terms"
          className="db-srow"
          style={{ textDecoration: 'none' }}
        >
          <div className="db-srow__icon" style={{ background: 'var(--color-cream-deep)', color: 'var(--fg-2)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <span className="db-srow__label">Terms of Service</span>
          <span className="db-srow__chevron">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </a>
      </div>
    </div>
  );
}
