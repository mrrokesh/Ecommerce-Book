import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const token = params.get('token') || '';

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/auth/reset', { token, password });
      setMsg(data.message);
      setOk(true);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page container">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Reset password</h1>
        <label>
          New password
          <input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {msg ? <p className={ok ? 'form-msg' : 'form-error'}>{msg}</p> : null}
        <button className="btn btn-navy block" disabled={busy || !token}>
          Update password
        </button>
        {ok ? (
          <p className="auth-switch">
            <Link to="/login">Sign in</Link>
          </p>
        ) : null}
      </form>
    </div>
  );
}
