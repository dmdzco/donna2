import { useState, type FormEvent } from 'react';
import { getEnvironmentConfig, getEnvironmentOptions, login, type ApiEnvironment } from '../hooks/useApi';

interface LoginPageProps {
  environment: ApiEnvironment;
  onEnvironmentChange: (environment: ApiEnvironment) => void;
  onLogin: () => void;
}

export function LoginPage({ environment, onEnvironmentChange, onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const environmentConfig = getEnvironmentConfig(environment);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password, environment);
      onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleSubmit}>
        <h1>Donna Observability</h1>
        <p className="login-subtitle">Sign in to {environmentConfig.label}</p>

        <div className="login-environment" role="group" aria-label="Select data environment">
          {getEnvironmentOptions().map(option => (
            <button
              key={option.key}
              type="button"
              className={option.key === environment ? 'active' : ''}
              onClick={() => {
                onEnvironmentChange(option.key);
                setError(null);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error && <div className="login-error">{error}</div>}

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
          required
          autoFocus
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
