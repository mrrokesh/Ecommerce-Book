import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COMPLAINT_STATUS_LABEL, complaintTone, type ComplaintMessage } from '../utils/complaints';

type Complaint = {
  ticket: string; subject: string; message: string; status: string; categoryLabel: string; orderNumber?: string | null;
  resolution?: string | null; createdAt: string; updatedAt: string;
};
type Summary = Pick<Complaint, 'ticket' | 'subject' | 'status' | 'createdAt'>;

/**
 * Follow a complaint. Signed-in customers open their own tickets from their account. Guests open a
 * ticket from the personal link we email them (the ticket number and email alone never open it);
 * they can ask for a fresh link below, which is only ever sent to the email on the ticket.
 */
export default function ComplaintTrackPage() {
  const { user } = useAuth();
  const [mine, setMine] = useState<Summary[]>([]);
  const [lookup, setLookup] = useState({ ticket: '', email: '' });
  const [linkSent, setLinkSent] = useState(false);
  const [active, setActive] = useState<{ ticket: string; token: string } | null>(null);
  const [data, setData] = useState<{ complaint: Complaint; messages: ComplaintMessage[] } | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tried = useRef(false);

  useEffect(() => {
    if (!user) { setMine([]); return; }
    api.get('/complaints/mine').then(({ data: d }) => setMine(d.complaints)).catch(() => undefined);
  }, [user]);

  async function open(ticket: string, token: string) {
    setBusy(true);
    setError('');
    try {
      const t = encodeURIComponent(ticket.trim().toUpperCase());
      const { data: d } = token ? await api.post(`/complaints/t/${t}/view`, { token }) : await api.get(`/complaints/t/${t}`);
      setData(d);
      setActive({ ticket: ticket.trim().toUpperCase(), token });
    } catch (err) {
      setData(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Opened from the emailed link: take the token out of the address bar straight away.
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    const p = new URLSearchParams(window.location.search);
    const n = p.get('n');
    const t = p.get('t');
    if (n && t) {
      window.history.replaceState(null, '', window.location.pathname);
      void open(n, t);
    }
  }, []);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/complaints/access-link', { ticket: lookup.ticket.trim().toUpperCase(), email: lookup.email.trim().toLowerCase() });
      setLinkSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/complaints/t/${encodeURIComponent(active.ticket)}/reply`, { token: active.token || undefined, message: reply });
      setReply('');
      await open(active.ticket, active.token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const c = data?.complaint;
  const closed = c?.status === 'closed';

  return (
    <div className="auth-page container complaint-track">
      <div className="auth-card">
        <h1>Check your complaint</h1>
        {!c ? (
          <>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {user ? (
              <>
                {mine.length ? (
                  <div className="complaint-mine" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
                    <h2>Your complaints</h2>
                    <ul>
                      {mine.map((m) => (
                        <li key={m.ticket}>
                          <button type="button" className="link-btn" onClick={() => void open(m.ticket, '')}>{m.ticket} · {m.subject}</button>
                          <span className={`c-pill ${complaintTone(m.status)}`}>{COMPLAINT_STATUS_LABEL[m.status] || m.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : <p className="muted">You have not raised a complaint from this account yet.</p>}
                <p className="auth-switch">Raised one without signing in? Use the link in your confirmation email, or ask for a new one below.</p>
              </>
            ) : (
              <p className="muted">Open the personal link from your confirmation email. If you signed in when you raised it, <Link to="/login" state={{ from: '/complaint/track' }}>sign in</Link> to see it.</p>
            )}
            {linkSent ? (
              <p className="form-msg" role="status">If those details match a complaint, we have emailed a secure link to that address. It works for 24 hours. Check your spam folder too.</p>
            ) : (
              <form onSubmit={requestLink}>
                <h2 style={{ fontSize: '1.05rem' }}>Lost your link?</h2>
                <p className="muted">Enter the ticket number and the email address you used. We email a new link to that address.</p>
                <label>
                  Ticket number
                  <input required value={lookup.ticket} onChange={(e) => setLookup({ ...lookup, ticket: e.target.value })} placeholder="CMP-000123" autoComplete="off" data-no-validate />
                </label>
                <label>
                  Email
                  <input type="email" required value={lookup.email} onChange={(e) => setLookup({ ...lookup, email: e.target.value })} autoComplete="email" />
                </label>
                <button className="btn btn-navy block" disabled={busy}>{busy ? 'Sending…' : 'Email me a new link'}</button>
              </form>
            )}
            <p className="auth-switch">Nothing yet? <Link to="/complaint">Raise a complaint</Link></p>
          </>
        ) : (
          <>
            <p className="complaint-ticket">{c.ticket}</p>
            <p>
              <strong>{c.subject}</strong>{' '}
              <span className={`c-pill ${complaintTone(c.status)}`}>{COMPLAINT_STATUS_LABEL[c.status] || c.status}</span>
            </p>
            <p className="muted">{c.categoryLabel}{c.orderNumber ? ` · Order ${c.orderNumber}` : ''} · Raised {new Date(c.createdAt).toLocaleDateString()}</p>
            <div className="complaint-thread" aria-live="polite">
              <div className="complaint-msg you"><b>You</b><p>{c.message}</p><small>{new Date(c.createdAt).toLocaleString()}</small></div>
              {data!.messages.map((m) => (
                <div key={m.id} className={`complaint-msg ${m.type === 'staff' ? 'team' : 'you'}`}>
                  <b>{m.type === 'staff' ? 'Salem Book House team' : 'You'}</b>
                  <p>{m.body}</p>
                  <small>{new Date(m.createdAt).toLocaleString()}</small>
                </div>
              ))}
            </div>
            {c.status === 'resolved' && c.resolution ? <p className="form-msg"><b>How it was resolved:</b> {c.resolution}</p> : null}
            {closed ? (
              <p className="muted">This complaint is closed. <Link to="/complaint">Raise a new one</Link> if the problem continues.</p>
            ) : (
              <form onSubmit={send}>
                <label>
                  {c.status === 'resolved' ? 'Not solved? Tell us more to reopen it' : 'Add a message'}
                  <textarea required rows={4} minLength={2} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} />
                </label>
                {error ? <p className="form-error" role="alert">{error}</p> : null}
                <button className="btn btn-navy block" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
              </form>
            )}
            <p className="auth-switch"><button type="button" className="link-btn" onClick={() => { setData(null); setActive(null); setError(''); }}>Back</button></p>
          </>
        )}
      </div>
    </div>
  );
}
