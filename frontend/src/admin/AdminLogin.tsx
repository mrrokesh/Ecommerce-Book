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
    <div className="adm-login">
      <aside className="adm-login-brand" aria-hidden="true">
        <img className="adm-login-logo" src="/sbh-logo.jpg" alt="" width={72} height={72} />
        <div className="adm-login-pitch">
          <h2>Run Salem Book House<br />with confidence.</h2>
          <ul>
            <li><span>&#10003;</span> Orders, returns and refunds in one place</li>
            <li><span>&#10003;</span> Send seasonal offers and track delivery</li>
            <li><span>&#10003;</span> Protected with optional two-factor sign-in</li>
          </ul>
        </div>
        <p className="adm-login-foot">Store admin and staff portal</p>
      </aside>

      <main className="adm-login-main">
        <form className="adm-login-form" onSubmit={onSubmit}>
          <div className="adm-login-mini">
            <img src="/sbh-logo.jpg" alt="" width={40} height={40} />
            <strong>Salem Book House</strong>
          </div>
          <h1>Sign in</h1>
          <p className="adm-login-sub">Use your admin or staff account.</p>
          <label>
            Email
            <input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>
            Authenticator code <span className="adm-login-hint">(only if two-factor is on)</span>
            <input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          {error ? <p className="erp-error">{error}</p> : null}
          <button type="submit" className="adm-login-submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="adm-login-links"><a href="/">Back to the store</a></p>
        </form>
      </main>
    </div>
  );
}
