import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SocialSignIn, { socialErrorMessage } from '../components/SocialSignIn';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => socialErrorMessage(params.get('error')));
  const [busy, setBusy] = useState(false);
  const from = typeof location.state?.from === 'string' ? location.state.from : '';
  const next = from && !from.startsWith('/admin') ? from : '/account';

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate(next);
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page container">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Login</h1>
        <p className="muted">Welcome back to Salem Book House</p>
        <SocialSignIn next={next} />
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="btn btn-navy block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
        <p className="auth-switch">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        <p className="auth-switch">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
