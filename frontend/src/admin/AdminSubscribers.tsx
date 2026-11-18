import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { confirmAction } from '../components/Dialogs';

type Sub = { source: string; ref: string; email: string; name?: string; consent_at: string; active: boolean };
type StatusFilter = 'all' | 'subscribed' | 'unsubscribed';

const SOURCE_LABEL: Record<string, string> = {
  account: 'Customer account',
  admin: 'Added by admin',
  signup: 'Sign-up form',
};

function csvCell(v: unknown) {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export default function AdminSubscribers() {
  const [rows, setRows] = useState<Sub[]>([]);
  const [totals, setTotals] = useState({ active: 0, unsubscribed: 0 });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [form, setForm] = useState({ email: '', name: '', consent: false });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const togglePick = (email: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(email)) n.delete(email);
      else n.add(email);
      return n;
    });

  async function load() {
    try {
      const { data } = await api.get('/campaigns/subscribers');
      setRows(data.subscribers || []);
      setTotals({ active: Number(data.active || 0), unsubscribed: Number(data.unsubscribed || 0) });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function run(fn: () => Promise<void>, ok?: string) {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await fn();
      if (ok) setMsg(ok);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { data } = await api.post('/campaigns/subscribers', {
        email: form.email,
        name: form.name,
        consent: form.consent,
      });
      setForm({ email: '', name: '', consent: false });
      setMsg(data.already ? 'That address is already subscribed.' : 'Subscriber added.');
      await load();
    });
  };

  const unsubscribe = async (s: Sub) => {
    if (
      !(await confirmAction(
        `Mark ${s.email} as unsubscribed? They will stop receiving promotional emails. They can opt in again from their account.`,
      ))
    )
      return;
    await run(async () => {
      await api.delete(`/campaigns/subscribers/${s.ref}`);
      await load();
    }, 'Marked unsubscribed');
  };

  function exportCsv() {
    const lines = [['Email', 'Name', 'Source', 'Agreed on', 'Status'].join(',')];
    for (const s of rows)
      lines.push(
        [
          s.email,
          s.name || '',
          SOURCE_LABEL[s.source] || s.source,
          new Date(s.consent_at).toISOString().slice(0, 10),
          s.active ? 'Subscribed' : 'Unsubscribed',
        ]
          .map(csvCell)
          .join(','),
      );
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === 'subscribed' && !r.active) return false;
      if (status === 'unsubscribed' && r.active) return false;
      if (!needle) return true;
      return `${r.email} ${r.name || ''}`.toLowerCase().includes(needle);
    });
  }, [rows, q, status]);

  const activeShown = shown.filter((s) => s.active);

  return (
    <div className="ops-stack">
      <div className="erp-card ops-panel">
        <h2>Subscribers</h2>
        <p className="muted">
          People who agreed to receive offers by email: customers who opted in on sign-up or in their account, plus anyone
          you add here. <strong>{totals.active} subscribed</strong>
          {', '}
          <strong>{totals.unsubscribed} unsubscribed</strong>. Unsubscribed people stay listed here (grey status) but are
          never emailed. <Link to="/admin/campaigns">Send an offer</Link>
        </p>
        {error ? <p className="erp-error">{error}</p> : null}
        {msg ? <p className="form-msg">{msg}</p> : null}

        <form className="ops-form" onSubmit={add}>
          <label>
            Email
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@example.com"
            />
          </label>
          <label>
            Name (optional)
            <input data-validate="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="ops-check">
            <input
              type="checkbox"
              checked={form.consent}
              onChange={(e) => setForm({ ...form, consent: e.target.checked })}
            />
            This person has agreed to receive offers and updates by email (required). Every email carries an unsubscribe
            link.
          </label>
          <div className="ops-form-actions">
            <button className="erp-btn primary" disabled={busy || !form.consent}>
              Add subscriber
            </button>
          </div>
        </form>
      </div>

      <div className="erp-card ops-panel">
        <div className="erp-toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input
            aria-label="Search subscribers"
            placeholder="Search email or name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-no-validate
          />
          <div className="sub-filter" role="group" aria-label="Status filter">
            {(
              [
                ['all', `All (${rows.length})`],
                ['subscribed', `Subscribed (${totals.active})`],
                ['unsubscribed', `Unsubscribed (${totals.unsubscribed})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`erp-btn${status === key ? ' primary' : ' ghost'}`}
                onClick={() => setStatus(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="erp-grow" />
          <button
            type="button"
            className="erp-btn primary"
            disabled={!picked.size}
            onClick={() => navigate('/admin/campaigns', { state: { emails: [...picked] } })}
          >
            Email selected ({picked.size})
          </button>
          <button type="button" className="erp-btn" onClick={exportCsv} disabled={!rows.length}>
            Export CSV
          </button>
        </div>
        {!shown.length ? (
          <p className="muted">
            {status === 'unsubscribed'
              ? 'No unsubscribed people yet. They appear here after Remove, or when they use the unsubscribe link in an email.'
              : 'No subscribers match.'}
          </p>
        ) : (
          <div className="ops-table">
            <table className="erp-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all shown"
                      data-no-validate
                      checked={activeShown.length > 0 && activeShown.every((s) => picked.has(s.email))}
                      onChange={(e) =>
                        setPicked(e.target.checked ? new Set(activeShown.map((s) => s.email)) : new Set())
                      }
                    />
                  </th>
                  <th>Email</th>
                  <th>Name</th>
                  <th>How they joined</th>
                  <th>Agreed on</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.source + s.ref} className={s.active ? undefined : 'is-muted'}>
                    <td>
                      {s.active ? (
                        <input
                          type="checkbox"
                          aria-label={`Select ${s.email}`}
                          data-no-validate
                          checked={picked.has(s.email)}
                          onChange={() => togglePick(s.email)}
                        />
                      ) : null}
                    </td>
                    <td title={s.email}>{s.email}</td>
                    <td>{s.name || '—'}</td>
                    <td>{SOURCE_LABEL[s.source] || s.source}</td>
                    <td>{new Date(s.consent_at).toLocaleDateString()}</td>
                    <td>
                      <span className={`erp-pill ${s.active ? 'ok' : 'off'}`}>
                        {s.active ? 'Subscribed' : 'Unsubscribed'}
                      </span>
                    </td>
                    <td>
                      {s.active ? (
                        <button type="button" className="erp-btn ghost" disabled={busy} onClick={() => unsubscribe(s)}>
                          Unsubscribe
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
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
