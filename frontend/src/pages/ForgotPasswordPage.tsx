import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/auth/forgot', { email });
      setMsg(data.message);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page container">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Forgot password</h1>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {msg ? <p className="form-msg">{msg}</p> : null}
        <button className="btn btn-navy block" disabled={busy}>
          Send reset link
        </button>
        <p className="auth-switch">
          <Link to="/login">Back to login</Link>
        </p>
      </form>
    </div>
  );
}
