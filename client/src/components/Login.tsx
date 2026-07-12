import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';

/**
 * LOGIN FORM — POST /auth/login. On success we hand the access token up to App,
 * which keeps it in memory. Demo seed user is prefilled (ada@example.com).
 */
export function Login({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [email, setEmail] = useState('ada@example.com');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { accessToken } = await api.login(email, password);
      onLoggedIn(accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app centered">
      <form className="card" onSubmit={handleSubmit}>
        <h1>DocuMind</h1>
        <p className="muted">Sign in to your knowledge base.</p>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
