import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SocialSignIn from '../components/SocialSignIn';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', marketingOptIn: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function onChange(e) {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [e.target.name]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(form);
      navigate('/account');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page container">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Create Account</h1>
        <p className="muted">Join Salem Book House</p>
        <SocialSignIn />
        <label>
          Full Name
          <input name="name" required value={form.name} onChange={onChange} />
        </label>
        <label>
          Email
          <input type="email" name="email" required value={form.email} onChange={onChange} />
        </label>
        <label>
          Phone
          <input name="phone" value={form.phone} onChange={onChange} />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            required
            data-validate="new-password"
            autoComplete="new-password"
            value={form.password}
            onChange={onChange}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <label className="check-row">
          <input type="checkbox" name="marketingOptIn" checked={form.marketingOptIn} onChange={onChange} />
          <span>Email me offers, new arrivals and sale alerts (optional; you can unsubscribe any time)</span>
        </label>
        <button type="submit" className="btn btn-navy block" disabled={busy}>
          {busy ? 'Creating…' : 'Register'}
        </button>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </form>
    </div>
  );
}
