import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';
import { askText } from '../components/Dialogs';
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUS_LABEL, complaintTone, type ComplaintMessage } from '../utils/complaints';

type Row = {
  id: number; ticket: string; name: string; email: string; phone?: string | null; orderNumber?: string | null; category: string; categoryLabel: string;
  subject: string; message: string; status: string; priority: string; assignedName?: string | null; resolution?: string | null;
  createdAt: string; updatedAt: string;
};
type Detail = { complaint: Row; messages: ComplaintMessage[]; order: { orderNumber: string; status: string; total: number; paymentMethod: string; placedAt: string } | null };

const TABS: { key: string; label: string }[] = [
  { key: 'active', label: 'Needs attention' },
  { key: 'open', label: 'New' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'waiting_customer', label: 'Waiting for customer' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
  { key: '', label: 'All' },
];

export default function AdminComplaints() {
  const [tab, setTab] = useState('active');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pages, setPages] = useState(1);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reply, setReply] = useState('');
  const [mode, setMode] = useState<'public' | 'note'>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/complaints/admin', { params: { status: tab || undefined, category: category || undefined, q: q.trim() || undefined, page } });
      setRows(data.complaints);
      setCounts(data.counts);
      setPages(data.pages);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tab, category, q, page]);
  useEffect(() => { const t = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);

  async function openRow(id: number) {
    setError(''); setMsg('');
    try {
      const { data } = await api.get(`/complaints/admin/${id}`);
      setDetail(data);
      setReply('');
      setMode('public');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function run(fn: () => Promise<void>, ok?: string) {
    setBusy(true); setError(''); setMsg('');
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const patch = (body: Record<string, unknown>, ok: string) =>
    run(async () => {
      if (!detail) return;
      await api.patch(`/complaints/admin/${detail.complaint.id}`, body);
      await openRow(detail.complaint.id);
      await load();
    }, ok);

  async function resolve() {
    if (!detail) return;
    const resolution = await askText({ title: 'Resolve complaint', label: 'How was it resolved? The customer will see this in an email.', multiline: true, minLength: 10, confirmText: 'Mark resolved' });
    if (resolution) await patch({ status: 'resolved', resolution }, 'Marked as resolved and the customer was emailed.');
  }

  const sendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    void run(async () => {
      await api.post(`/complaints/admin/${detail.complaint.id}/reply`, { body: reply, visibility: mode });
      await openRow(detail.complaint.id);
      await load();
    }, mode === 'note' ? 'Internal note saved.' : 'Reply sent to the customer.');
  };

  const c = detail?.complaint;
  const done = c && ['resolved', 'closed'].includes(c.status);

  return (
    <div className="ops-stack complaints-admin">
      <div className="erp-card ops-panel">
        <h2>Customer complaints</h2>
        <p className="muted">Complaints raised on the store. Open one to read it, reply to the customer, add internal notes and mark it resolved.</p>
        <div className="erp-tabs" role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {TABS.map((t) => {
            const n = t.key === 'active' ? (counts.open || 0) + (counts.in_progress || 0) + (counts.waiting_customer || 0) : t.key ? counts[t.key] || 0 : Object.values(counts).reduce((a, b) => a + b, 0);
            return (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`erp-btn${tab === t.key ? ' primary' : ''}`} onClick={() => { setTab(t.key); setPage(1); }}>
                {t.label} ({n})
              </button>
            );
          })}
        </div>
        <div className="erp-toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input aria-label="Search complaints" placeholder="Search ticket, name, email, order or subject" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} data-no-validate />
          <select aria-label="Filter by category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} data-no-validate>
            <option value="">All categories</option>
            {COMPLAINT_CATEGORIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </div>
        {error && !detail ? <p className="erp-error">{error}</p> : null}
        {!rows.length ? <p className="muted">No complaints here.</p> : (
          <div className="ops-table">
            <table className="erp-table">
              <thead><tr><th>Ticket</th><th>Customer</th><th>Subject</th><th>Type</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={c?.id === r.id ? 'is-selected' : ''}>
                    <td><button type="button" className="link-btn" onClick={() => void openRow(r.id)}>{r.ticket}</button></td>
                    <td title={r.email}>{r.name}<br /><small className="muted">{r.email}</small></td>
                    <td>{r.subject}</td>
                    <td>{r.categoryLabel}</td>
                    <td><span className={`erp-pill ${r.priority === 'high' ? 'bad' : ''}`}>{r.priority}</span></td>
                    <td><span className={`erp-pill ${complaintTone(r.status)}`}>{COMPLAINT_STATUS_LABEL[r.status] || r.status}</span></td>
                    <td>{new Date(r.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 ? (
          <div className="erp-toolbar" style={{ gap: 8, marginTop: 8 }}>
            <button type="button" className="erp-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="muted">Page {page} of {pages}</span>
            <button type="button" className="erp-btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        ) : null}
      </div>

      {c && detail ? (
        <div className="erp-card ops-panel complaint-detail">
          <div className="erp-toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{c.ticket}</h2>
            <span className={`erp-pill ${complaintTone(c.status)}`}>{COMPLAINT_STATUS_LABEL[c.status] || c.status}</span>
            <span className="erp-grow" />
            <button type="button" className="erp-btn" onClick={() => setDetail(null)}>Close panel</button>
          </div>
          {error ? <p className="erp-error">{error}</p> : null}
          {msg ? <p className="form-msg">{msg}</p> : null}
          <p><strong>{c.subject}</strong></p>
          <p className="muted">
            {c.categoryLabel} · {c.name} · <a href={`mailto:${c.email}`}>{c.email}</a>{c.phone ? <> · <a href={`tel:${c.phone}`}>{c.phone}</a></> : null} · Raised {new Date(c.createdAt).toLocaleString()}
          </p>
          {detail.order ? (
            <p className="muted">Order <strong>{detail.order.orderNumber}</strong>: {detail.order.status.replace(/_/g, ' ')}, ₹{detail.order.total.toLocaleString('en-IN')}, {detail.order.paymentMethod}</p>
          ) : c.orderNumber ? <p className="muted">Order number given: {c.orderNumber} (no match found)</p> : null}

          <div className="ops-form" style={{ gap: 8, alignItems: 'end' }}>
            <label>Priority
              <select value={c.priority} disabled={busy} onChange={(e) => void patch({ priority: e.target.value }, 'Priority updated.')}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
              </select>
            </label>
            <label>Status
              <select value={c.status} disabled={busy} onChange={(e) => { if (e.target.value === 'resolved') void resolve(); else void patch({ status: e.target.value }, 'Status updated.'); }}>
                {Object.entries(COMPLAINT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <span className="muted">Assigned to: <strong>{c.assignedName || 'nobody'}</strong></span>
            <button type="button" className="erp-btn" disabled={busy} onClick={() => void patch({ assign: 'me' }, 'Assigned to you.')}>Assign to me</button>
            {!done ? <button type="button" className="erp-btn primary" disabled={busy} onClick={() => void resolve()}>Mark resolved</button> : null}
          </div>
          {c.resolution ? <p className="form-msg"><b>Resolution:</b> {c.resolution}</p> : null}

          <div className="complaint-thread">
            <div className="complaint-msg you"><b>{c.name} (original complaint)</b><p>{c.message}</p><small>{new Date(c.createdAt).toLocaleString()}</small></div>
            {detail.messages.map((m) => (
              <div key={m.id} className={`complaint-msg ${m.type === 'customer' ? 'you' : m.type === 'note' ? 'note' : 'team'}`}>
                <b>{m.type === 'note' ? `Internal note · ${m.author}` : m.type === 'staff' ? `Reply · ${m.author}` : m.author}</b>
                <p>{m.body}</p>
                <small>{new Date(m.createdAt).toLocaleString()}</small>
              </div>
            ))}
          </div>

          <form onSubmit={sendReply} className="complaint-reply">
            <div className="erp-toolbar" style={{ gap: 6 }}>
              <button type="button" className={`erp-btn${mode === 'public' ? ' primary' : ''}`} onClick={() => setMode('public')}>Reply to customer</button>
              <button type="button" className={`erp-btn${mode === 'note' ? ' primary' : ''}`} onClick={() => setMode('note')}>Internal note</button>
            </div>
            <textarea aria-label={mode === 'note' ? 'Internal note' : 'Reply to customer'} required rows={4} minLength={2} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)}
              placeholder={mode === 'note' ? 'Only staff can see this note' : 'The customer receives this by email and sees it on their ticket'} />
            <button className="erp-btn primary" disabled={busy}>{mode === 'note' ? 'Save note' : 'Send reply'}</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
