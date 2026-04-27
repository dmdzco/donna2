import { useNavigate } from 'react-router-dom';

export default function BackButton({ to = '/dashboard/settings' }) {
  const navigate = useNavigate();

  return (
    <button className="db-back" onClick={() => navigate(to)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Settings
    </button>
  );
}
