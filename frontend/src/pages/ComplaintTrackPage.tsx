import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COMPLAINT_STATUS_LABEL, complaintTone, type ComplaintMessage } from '../utils/complaints';

type Complaint = {
  ticket: string; subject: string; message: string; status: string; categoryLabel: string; orderNumber?: string | null;
  resolution?: string | null; createdAt: string; updatedAt: string;
};
type Summary = Pick<Complaint, 'ticket' | 'subject' | 'status' | 'createdAt'>;

/** Look up a ticket (ticket number + email, or from your account) and follow up on it. */
export default function ComplaintTrackPage() {
  const { user } = useAuth();
  const [mine, setMine] = useState<Summary[]>([]);
  const [lookup, setLookup] = useState({ ticket: '', email: '' });
  const [active, setActive] = useState<{ ticket: string; email: string } | null>(null);
  const [data, setData] = useState<{ complaint: Complaint; messages: ComplaintMessage[] } | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) { setMine([]); return; }
    api.get('/complaints/mine').then(({ data: d }) => setMine(d.complaints)).catch(() => undefined);
  }, [user]);

  async function open(ticket: string, email: string) {
    setBusy(true);
    setError('');
    try {
      const { data: d } = await api.get(`/complaints/t/${encodeURIComponent(ticket.trim().toUpperCase())}`, { params: email ? { email } : undefined });
      setData(d);
      setActive({ ticket: ticket.trim().toUpperCase(), email });
    } catch (err) {
      setData(null);
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
      await api.post(`/complaints/t/${encodeURIComponent(active.ticket)}/reply`, { email: active.email || undefined, message: reply });
      setReply('');
      await open(active.ticket, active.email);
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
            <form onSubmit={(e) => { e.preventDefault(); void open(lookup.ticket, lookup.email.trim().toLowerCase()); }}>
              <p className="muted">Enter the ticket number from your confirmation email and the email address you used.</p>
              <label>
                Ticket number
                <input required value={lookup.ticket} onChange={(e) => setLookup({ ...lookup, ticket: e.target.value })} placeholder="CMP-000123" autoComplete="off" data-no-validate />
              </label>
              <label>
                Email
                <input type="email" required value={lookup.email} onChange={(e) => setLookup({ ...lookup, email: e.target.value })} autoComplete="email" />
              </label>
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <button className="btn btn-navy block" disabled={busy}>{busy ? 'Looking…' : 'Find my complaint'}</button>
            </form>
            {mine.length ? (
              <div className="complaint-mine">
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
            ) : null}
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
            <p className="auth-switch"><button type="button" className="link-btn" onClick={() => { setData(null); setActive(null); setError(''); }}>Check another ticket</button></p>
          </>
        )}
      </div>
    </div>
  );
}
