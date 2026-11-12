import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { confirmAction } from '../components/Dialogs';

type Sub = { source: string; ref: string; email: string; name?: string; consent_at: string; active: boolean };

const SOURCE_LABEL: Record<string, string> = { account: 'Customer account', admin: 'Added by admin', signup: 'Sign-up form' };

function csvCell(v: unknown) {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s; // keep spreadsheets from running a cell as a formula
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export default function AdminSubscribers() {
  const [rows, setRows] = useState<Sub[]>([]);
  const [totals, setTotals] = useState({ active: 0, unsubscribed: 0 });
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ email: '', name: '', consent: false });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { data } = await api.get('/campaigns/subscribers');
      setRows(data.subscribers);
      setTotals({ active: data.active, unsubscribed: data.unsubscribed });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { void load(); }, []);

  async function run(fn: () => Promise<void>, ok?: string) {
    setBusy(true); setError(''); setMsg('');
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { data } = await api.post('/campaigns/subscribers', { email: form.email, name: form.name, consent: form.consent });
      setForm({ email: '', name: '', consent: false });
      setMsg(data.already ? 'That address is already subscribed.' : 'Subscriber added.');
      await load();
    });
  };

  const remove = async (s: Sub) => {
    if (!(await confirmAction(`Remove ${s.email} from promotional emails? They will stop receiving offers.`))) return;
    await run(async () => { await api.delete(`/campaigns/subscribers/${s.ref}`); await load(); }, 'Removed from offers');
  };

  function exportCsv() {
    const lines = [['Email', 'Name', 'Source', 'Agreed on', 'Status'].join(',')];
    for (const s of rows) lines.push([s.email, s.name || '', SOURCE_LABEL[s.source] || s.source, new Date(s.consent_at).toISOString().slice(0, 10), s.active ? 'Subscribed' : 'Unsubscribed'].map(csvCell).join(','));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const shown = rows.filter((r) => !q.trim() || `${r.email} ${r.name || ''}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="ops-stack">
      <div className="erp-card ops-panel">
        <h2>Subscribers</h2>
        <p className="muted">
          People who agreed to receive offers by email: customers who ticked the box on sign-up or in their account, plus
          anyone you add here. <strong>{totals.active} subscribed</strong>
          {totals.unsubscribed ? `, ${totals.unsubscribed} unsubscribed` : ''}. <Link to="/admin/campaigns">Send an offer</Link>
        </p>
        {error ? <p className="erp-error">{error}</p> : null}
        {msg ? <p className="form-msg">{msg}</p> : null}

        <form className="ops-form" onSubmit={add}>
          <label>Email
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" />
          </label>
          <label>Name (optional)
            <input data-validate="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="check-row" style={{ flexBasis: '100%' }}>
            <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
            <span>This person has agreed to receive offers and updates by email (required). Every email carries an unsubscribe link.</span>
          </label>
          <button className="erp-btn primary" disabled={busy || !form.consent}>Add subscriber</button>
        </form>
      </div>

      <div className="erp-card ops-panel">
        <div className="erp-toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input aria-label="Search subscribers" placeholder="Search email or name" value={q} onChange={(e) => setQ(e.target.value)} data-no-validate />
          <span className="erp-grow" />
          <button type="button" className="erp-btn" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
        </div>
        {!shown.length ? <p className="muted">No subscribers yet.</p> : (
          <div className="ops-table">
            <table className="erp-table">
              <thead><tr><th>Email</th><th>Name</th><th>How they joined</th><th>Agreed on</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.source + s.ref}>
                    <td title={s.email}>{s.email}</td>
                    <td>{s.name || '-'}</td>
                    <td>{SOURCE_LABEL[s.source] || s.source}</td>
                    <td>{new Date(s.consent_at).toLocaleDateString()}</td>
                    <td><span className={`erp-pill ${s.active ? 'ok' : 'bad'}`}>{s.active ? 'Subscribed' : 'Unsubscribed'}</span></td>
                    <td>{s.active ? <button type="button" className="erp-btn" disabled={busy} onClick={() => remove(s)}>Remove</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
