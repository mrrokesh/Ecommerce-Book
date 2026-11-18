import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';

export default function AdminSetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMsg('Passwords do not match');
      setOk(false);
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const { data } = await api.post('/auth/reset', { token, password });
      setMsg(data.message || 'Password updated. You can sign in now.');
      setOk(true);
      setTimeout(() => navigate('/admin/login', { replace: true }), 1200);
    } catch (err: any) {
      setMsg(err.message || 'Could not set password');
      setOk(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-login">
      <aside className="adm-login-brand">
        <img src="/sbh-logo.jpg" alt="" width={56} height={56} />
        <h1>Salem Book House</h1>
        <p>Set your admin password to finish joining the store portal.</p>
      </aside>
      <main className="adm-login-main">
        <form className="adm-login-card" onSubmit={onSubmit}>
          <h2>Set password</h2>
          {!token ? (
            <p className="erp-error">This link is missing a token. Ask your admin for a new invite.</p>
          ) : (
            <>
              <label>
                New password
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  data-validate="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              {msg ? <p className={ok ? 'form-msg' : 'form-error'}>{msg}</p> : null}
              <button className="erp-btn primary" type="submit" disabled={busy || !token} style={{ width: '100%' }}>
                {busy ? 'Saving…' : 'Save password'}
              </button>
            </>
          )}
          <p className="erp-login-foot">
            <Link to="/admin/login">Back to admin sign-in</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
