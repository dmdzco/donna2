import { Link } from 'react-router-dom';

export default function SettingsRow({ to, icon, iconBg, iconColor, label }) {
  return (
    <Link to={to} className="db-srow">
      <div className="db-srow__icon" style={{ background: iconBg, color: iconColor || '#fff' }}>
        {icon}
      </div>
      <span className="db-srow__label">{label}</span>
      <span className="db-srow__chevron">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </span>
    </Link>
  );
}
