import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COMPLAINT_CATEGORIES } from '../utils/complaints';

/** Raise a complaint. Works signed in (name and email come from the account) or as a guest. */
export default function ComplaintPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ category: '', orderNumber: '', name: '', email: '', phone: '', subject: '', message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ticket, setTicket] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/complaints', {
        ...form,
        name: user ? undefined : form.name,
        email: user ? undefined : form.email,
      });
      setTicket(data.ticket);
    } catch (err) {
      setError((err as Error).message || 'Could not submit your complaint. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (ticket) {
    return (
      <div className="auth-page container">
        <div className="auth-card complaint-done">
          <h1>Complaint received</h1>
          <p className="muted">Thank you. We have emailed you a confirmation and our team will reply on this ticket.</p>
          <p className="complaint-ticket" aria-label="Your ticket number">{ticket}</p>
          <p className="muted">Keep this number. You need it, with your email address, to check progress or reply.</p>
          <Link className="btn btn-navy block" to="/complaint/track">Check my complaint</Link>
          <p className="auth-switch"><Link to="/">Back to the store</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page container">
      <form className="auth-card complaint-card" onSubmit={onSubmit} noValidate={false}>
        <h1>Raise a complaint</h1>
        <p className="muted">
          Tell us what went wrong and we will look into it. Already raised one? <Link to="/complaint/track">Check its progress</Link>.
        </p>
        <label>
          What is it about?
          <select required value={form.category} onChange={set('category')}>
            <option value="">Choose one…</option>
            {COMPLAINT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label>
          Order number (if it is about an order)
          <input value={form.orderNumber} onChange={set('orderNumber')} maxLength={30} placeholder="For example SBH-1001" autoComplete="off" data-no-validate />
        </label>
        {user ? (
          <p className="muted complaint-as">Raising this as <strong>{user.name}</strong> ({user.email}).</p>
        ) : (
          <>
            <label>
              Your name
              <input data-validate="name" required value={form.name} onChange={set('name')} autoComplete="name" />
            </label>
            <label>
              Email
              <input type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
            </label>
          </>
        )}
        <label>
          Mobile number (optional)
          <input type="tel" inputMode="numeric" data-validate="phone" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="10-digit mobile number" data-optional="true" />
        </label>
        <label>
          Subject
          <input required minLength={5} maxLength={120} value={form.subject} onChange={set('subject')} placeholder="A short summary" />
        </label>
        <label>
          Details
          <textarea required rows={6} minLength={20} maxLength={2000} value={form.message} onChange={set('message')} placeholder="What happened, when, and what would you like us to do?" />
          <span className="muted complaint-count">{form.message.length}/2000</span>
        </label>
        {/* Honeypot: real people never see or fill this */}
        <div className="complaint-hp" aria-hidden="true">
          <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} data-no-validate /></label>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button type="submit" className="btn btn-navy block" disabled={busy}>{busy ? 'Sending…' : 'Submit complaint'}</button>
      </form>
    </div>
  );
}
