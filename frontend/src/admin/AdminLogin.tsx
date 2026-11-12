import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './admin.css';

export default function AdminLogin() {
  const { user, loading, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code,setCode]=useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const requested = typeof location.state?.from === 'string' && location.state.from.startsWith('/admin')
    ? location.state.from
    : '/admin';

  // The portal layout redirects staff to their first allowed section if needed.
  if (!loading && (user?.role === 'admin' || user?.role === 'staff')) {
    return <Navigate to={requested} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = (await login(email, password, code)) as { user?: { role?: string }; role?: string };
      const signedIn = data.user || data;
      if (signedIn?.role !== 'admin' && signedIn?.role !== 'staff') {
        await logout();
        setError('This account does not have admin access.');
        return;
      }
      navigate(requested, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="erp-login">
      <form className="erp-login-card" onSubmit={onSubmit}>
        <div className="erp-login-brand">
          <img src="/sbh-logo.jpg" alt="" width={44} height={44} />
          <div>
            <strong>Salem Book House</strong>
            <span>Store admin</span>
          </div>
        </div>
        <h1>Sign in</h1>
        <p className="erp-login-sub">Use your admin or staff account.</p>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>Authenticator code (if enabled)<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} /></label>
        {error ? <p className="erp-error">{error}</p> : null}
        <button type="submit" className="erp-btn primary erp-login-submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
