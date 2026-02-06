import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

export default function Login() {
  const { login, token } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect
  if (token) {
    navigate('/', { replace: true });
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-admin-primary to-admin-bg flex items-center justify-center">
      <div className="bg-white rounded-2xl p-10 w-[90%] max-w-[400px] shadow-float">
        <h1 className="text-center text-2xl font-bold text-admin-text mb-2">Donna Admin</h1>
        <p className="text-center text-admin-text-muted text-sm mb-6">Sign in to manage your seniors</p>

        <form onSubmit={handleSubmit}>
          <div className="mb-3.5">
            <label className="block text-sm font-semibold text-admin-text-light mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@donna.com"
              className="w-full px-3 py-2.5 border border-admin-border rounded-lg text-sm focus:outline-none focus:border-admin-primary transition-colors"
            />
          </div>
          <div className="mb-3.5">
            <label className="block text-sm font-semibold text-admin-text-light mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Your password"
              className="w-full px-3 py-2.5 border border-admin-border rounded-lg text-sm focus:outline-none focus:border-admin-primary transition-colors"
            />
          </div>

          {error && (
            <p className="text-admin-danger text-sm mb-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-admin-accent hover:bg-admin-accent-hover text-white py-2.5 rounded-full text-sm font-semibold hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
