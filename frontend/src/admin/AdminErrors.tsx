import { useEffect, useState } from 'react';
import api from '../api/client';

type SiteError = {
  id: number;
  source: string;
  severity: string;
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  status_code?: number | null;
  url?: string | null;
  user_agent?: string | null;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
  status: 'open' | 'resolved' | 'ignored';
  last_emailed_at?: string | null;
};

type Counts = { open: number; resolved: number; ignored: number };

function when(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN');
  } catch {
    return '—';
  }
}

export default function AdminErrors() {
  const [status, setStatus] = useState<'open' | 'resolved' | 'ignored' | 'all'>('open');
  const [rows, setRows] = useState<SiteError[]>([]);
  const [counts, setCounts] = useState<Counts>({ open: 0, resolved: 0, ignored: 0 });
  const [selected, setSelected] = useState<SiteError | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(next = status) {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.get('/errors', { params: { status: next, pageSize: 40 } });
      setRows(data.errors || []);
      setCounts(data.counts || { open: 0, resolved: 0, ignored: 0 });
      if (selected) {
        const fresh = (data.errors || []).find((e: SiteError) => e.id === selected.id);
        setSelected(fresh || null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function setRowStatus(id: number, next: 'open' | 'resolved' | 'ignored') {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/errors/${id}`, { status: next });
      await load(status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-stack">
      <div className="erp-card ops-panel">
        <h2 style={{ marginTop: 0 }}>Site errors</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Live storefront and admin crashes are stored here and emailed to the alert list. Ask Cursor to “fix the
          latest errors” and point at an open row — the fingerprint and stack are enough to patch.
        </p>
        {error ? <p className="erp-error">{error}</p> : null}
        <div className="erp-toolbar" style={{ padding: 0, border: 0, marginBottom: 12 }}>
          {(
            [
              ['open', `Open (${counts.open})`],
              ['resolved', `Resolved (${counts.resolved})`],
              ['ignored', `Ignored (${counts.ignored})`],
              ['all', 'All'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`erp-btn${status === key ? ' primary' : ' ghost'}`}
              onClick={() => setStatus(key)}
              disabled={busy}
            >
              {label}
            </button>
          ))}
          <span className="erp-grow" />
          <button type="button" className="erp-btn ghost" disabled={busy} onClick={() => load(status)}>
            Refresh
          </button>
        </div>

        {!rows.length ? (
          <p className="muted">No {status === 'all' ? '' : status} errors.</p>
        ) : (
          <div className="ops-table">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Source</th>
                  <th>Message</th>
                  <th className="num">Count</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={selected?.id === r.id ? 'is-selected' : undefined}>
                    <td className="muted">{when(r.last_seen_at)}</td>
                    <td>
                      <span className="erp-pill info">{r.source}</span>
                    </td>
                    <td title={r.message}>
                      <button type="button" className="a-link primary" onClick={() => setSelected(r)}>
                        {r.message.length > 90 ? `${r.message.slice(0, 90)}…` : r.message}
                      </button>
                      {r.path ? <div className="muted">{r.method ? `${r.method} ` : ''}{r.path}</div> : null}
                    </td>
                    <td className="num">{r.occurrences}</td>
                    <td>
                      <span className={`erp-pill ${r.status === 'open' ? 'warn' : r.status === 'resolved' ? 'ok' : 'off'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <div className="a-row-actions">
                        {r.status !== 'resolved' ? (
                          <button type="button" className="a-link" disabled={busy} onClick={() => setRowStatus(r.id, 'resolved')}>
                            Resolve
                          </button>
                        ) : (
                          <button type="button" className="a-link" disabled={busy} onClick={() => setRowStatus(r.id, 'open')}>
                            Reopen
                          </button>
                        )}
                        {r.status !== 'ignored' ? (
                          <button type="button" className="a-link danger" disabled={busy} onClick={() => setRowStatus(r.id, 'ignored')}>
                            Ignore
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected ? (
        <div className="erp-card ops-panel">
          <div className="erp-toolbar" style={{ padding: 0, border: 0 }}>
            <h2 style={{ margin: 0 }}>Error #{selected.id}</h2>
            <span className="erp-grow" />
            <button type="button" className="erp-btn ghost" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <dl className="erp-customer-meta">
            <div>
              <dt>Message</dt>
              <dd>{selected.message}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                {selected.source} · {selected.severity}
              </dd>
            </div>
            <div>
              <dt>Path</dt>
              <dd>
                {selected.method || '—'} {selected.path || '—'}
              </dd>
            </div>
            <div>
              <dt>URL</dt>
              <dd style={{ wordBreak: 'break-all' }}>{selected.url || '—'}</dd>
            </div>
            <div>
              <dt>Occurrences</dt>
              <dd>{selected.occurrences}</dd>
            </div>
            <div>
              <dt>First / last</dt>
              <dd>
                {when(selected.first_seen_at)} → {when(selected.last_seen_at)}
              </dd>
            </div>
            <div>
              <dt>Last emailed</dt>
              <dd>{when(selected.last_emailed_at)}</dd>
            </div>
            <div>
              <dt>User agent</dt>
              <dd style={{ wordBreak: 'break-all' }}>{selected.user_agent || '—'}</dd>
            </div>
          </dl>
          {selected.stack ? (
            <>
              <h3>Stack</h3>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  background: '#0f172a',
                  color: '#e2e8f0',
                  borderRadius: 8,
                  fontSize: 12,
                  overflow: 'auto',
                  maxHeight: 360,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {selected.stack}
              </pre>
            </>
          ) : (
            <p className="muted">No stack trace for this entry.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
