import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { askText, confirmAction } from '../components/Dialogs';
import { Link } from 'react-router-dom';
import api from '../api/client';

type Row = Record<string, unknown>;
type Result = {
  rows?: Row[];
  refunds?: Row[];
  attempts?: Row[];
  transactions?: Row[];
  trend?: Row[];
  bestsellers?: Row[];
  stats?: Row;
  orders?: Row[];
  notes?: Row[];
  customer?: Row;
} & Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}(T|\s)/;

const STAT_LABELS: Record<string, string> = {
  orders: 'Orders',
  collected: 'Collected',
  outstanding_cod: 'Outstanding COD',
  refunded: 'Refunded',
  revenue: 'Revenue',
  gmv: 'GMV',
};

function value(v: unknown) {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function labelize(key: string) {
  if (STAT_LABELS[key]) return STAT_LABELS[key];
  return key
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function cell(v: unknown) {
  if (v == null) return '—';
  if (typeof v === 'string' && ISO_DAY.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  const s = value(v);
  return UUID.test(s) ? `${s.slice(0, 8)}…` : s;
}

function Table({ rows = [], actions, hide = [], empty = 'No records found.' }: { rows?: Row[]; actions?: (row: Row) => ReactNode; hide?: string[]; empty?: string }) {
  if (!rows.length) return <p className="muted ops-empty">{empty}</p>;
  const keys = Object.keys(rows[0]).filter((k) => !['payload', 'quote', 'razorpay_payment_id', ...hide].includes(k));
  return (
    <div className="ops-table" role="region" tabIndex={0}>
      <table className="erp-table">
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{labelize(k)}</th>
            ))}
            {actions ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r.id ?? i)}>
              {keys.map((k) => (
                <td
                  key={k}
                  title={value(r[k])}
                  className={['reason', 'items', 'details', 'error', 'body', 'subject'].includes(k) ? 'wide' : undefined}
                >
                  {k === 'sent' && typeof r[k] === 'boolean' ? (
                    <span className={`erp-pill ${r[k] ? 'ok' : 'warn'}`}>{r[k] ? 'Sent' : 'Not sent'}</span>
                  ) : k.endsWith('_at') && typeof r[k] === 'string' && !Number.isNaN(Date.parse(String(r[k]))) ? (
                    new Date(String(r[k])).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                  ) : typeof r[k] === 'boolean' ? (
                    r[k] ? 'Yes' : 'No'
                  ) : (
                    cell(r[k])
                  )}
                </td>
              ))}
              {actions ? <td>{actions(r)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** YYYY-MM-DD in the browser's own time zone (toISOString would give the UTC day and drop today's orders for hours after midnight in India). */
function localDay(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** What each searchable list can be searched by. */
const SEARCH_HINT: Record<string, string> = {
  customers: 'Search name or email',
  inventory: 'Search product name',
  gifts: 'Search gift-card code',
  emails: 'Search email address or subject',
  returns: 'Search order number or customer name',
};

/** Sections whose list the server can filter by the search box. */
const SEARCHABLE = ['customers', 'inventory', 'gifts', 'emails', 'returns'];

export default function AdminOperations({ section }: { section: string }) {
  const [data, setData] = useState<Result>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(localDay(-30));
  const [to, setTo] = useState(localDay());
  const [detail, setDetail] = useState<Result | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [cases, setCases] = useState<Row[]>([]);
  const [history, setHistory] = useState<Row[]>([]);

  async function load() {
    setBusy(true);
    setError('');
    try {
      const r = await api.get('/operations/' + section, {
        params: { page, q, from, to, low: section === 'inventory' ? 'true' : undefined },
      });
      setData(r.data);
      if (section === 'returns') {
        const returns = await api.get('/returns/admin');
        setCases(returns.data.rows);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setDetail(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, page]);

  async function act(path: string, body: Row = {}, method = 'post') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await api.request({ url: '/operations/' + path, method, data: body });
      if (r.data?.error) throw new Error(r.data.error);
      setNotice('Saved successfully.');
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function form(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.currentTarget).entries());
  }

  async function customer(id: string) {
    try {
      const r = await api.get('/operations/customers/' + id);
      if (!r.data?.customer) throw new Error('Customer not found');
      setDetail(r.data);
      setCustomerId(id);
      requestAnimationFrame(() =>
        document.getElementById('ops-customer-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
    } catch (e) {
      setDetail(null);
      setError((e as Error).message);
    }
  }

  const button = (label: string, fn: () => void) => (
    <button type="button" className="erp-btn" disabled={busy} onClick={fn}>
      {label}
    </button>
  );

  const showSearch = SEARCHABLE.includes(section);

  return (
    <div className="ops-stack">
      <div className="erp-card ops-panel">
        <form
          hidden={['settings', 'payments'].includes(section)}
          className="erp-toolbar ops-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            void load();
          }}
        >
          {showSearch ? (
            <input
              aria-label="Search records"
              placeholder={SEARCH_HINT[section] || 'Search'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          ) : null}
          {section === 'reports' ? (
            <>
              <label className="ops-date">
                From
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="ops-date">
                To
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </>
          ) : null}
          {showSearch ? (
            <button type="submit" className="erp-btn" disabled={busy}>
              Search
            </button>
          ) : null}
          {button(busy ? 'Loading…' : 'Refresh', () => void load())}
        </form>

        {error ? (
          <p role="alert" className="erp-error">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="erp-ok">
            {notice}
          </p>
        ) : null}

        {section === 'settings' ? (
          <form
            className="ops-form settings-form"
            onSubmit={(e) => {
              const f = form(e);
              void act('settings', { ...f, restrictedCoverage: f.restrictedCoverage === 'on' }, 'put');
            }}
          >
            {(
              [
                ['shippingFee', 'Shipping fee (₹)', '0.01'],
                ['freeShippingThreshold', 'Free shipping from (₹)', '0.01'],
                ['returnDays', 'Return window (days)', '1'],
                ['lowStockThreshold', 'Low stock alert at', '1'],
              ] as const
            ).map(([k, label, step]) => (
              <label key={k}>
                {label}
                <input
                  key={String(data[k])}
                  name={k}
                  type="number"
                  min="0"
                  step={step}
                  required
                  defaultValue={String(data[k] ?? '')}
                />
              </label>
            ))}
            <label className="ops-check">
              <input
                name="restrictedCoverage"
                type="checkbox"
                key={String(data.restrictedCoverage)}
                defaultChecked={!!data.restrictedCoverage}
              />
              Deliver only to configured pincodes
            </label>
            <div className="ops-form-actions">
              <button className="erp-btn primary" disabled={busy}>
                Save settings
              </button>
            </div>
          </form>
        ) : null}

        {section === 'inventory' ? (
          <section className="ops-section inv-section">
            <h2>Low stock</h2>
            <form className="inv-adjust" onSubmit={(e) => void act('inventory/adjust', form(e))}>
              <label>
                Product ID
                <input name="bookId" type="number" required />
              </label>
              <label>
                Quantity adjustment
                <input name="delta" type="number" required placeholder="10 or -2" />
              </label>
              <label className="inv-reason">
                Reason
                <input name="reason" required placeholder="e.g. restock / damage" />
              </label>
              <div className="inv-actions">
                <button className="erp-btn primary" disabled={busy} type="submit">
                  Adjust stock
                </button>
                <button
                  type="button"
                  className="erp-btn"
                  disabled={busy}
                  onClick={() => {
                    api
                      .get('/operations/inventory/history')
                      .then((r) => setHistory(r.data.rows))
                      .catch((e) => setError(e.message));
                  }}
                >
                  Load stock history
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {section === 'payments' ? (
          <>
            <section className="ops-section">
              <h2>Issue a refund</h2>
              <p className="muted">
                Refunds stay pending until the gateway confirms them. For COD, record completion only after returning the
                money.
              </p>
              <form className="ops-form" onSubmit={(e) => void act('payments/refund', form(e))}>
                <label>
                  Order number
                  <input name="order" required autoComplete="off" />
                </label>
                <label>
                  Amount ₹
                  <input name="amount" type="number" min="0.01" step="0.01" required />
                </label>
                <label>
                  Reason
                  <input name="reason" required />
                </label>
                <div className="ops-form-actions">
                  <button className="erp-btn primary" disabled={busy}>
                    Request refund
                  </button>
                </div>
              </form>
            </section>
            <section className="ops-section">
              <h2>Refund history</h2>
              <Table
                rows={data.refunds}
                actions={(r) =>
                  r.status !== 'completed'
                    ? button(r.razorpay_payment_id ? 'Retry / check gateway' : 'Confirm money returned', async () => {
                        if (
                          r.razorpay_payment_id ||
                          (await confirmAction('Confirm you have returned this amount to the customer?'))
                        )
                          void act(`payments/refunds/${r.id}/retry`, { manual: !r.razorpay_payment_id });
                      })
                    : null
                }
              />
            </section>
            <section className="ops-section">
              <h2>Payment reconciliation</h2>
              <Table
                rows={data.attempts}
                actions={(r) =>
                  !r.order_id ? (
                    <>
                      {button('Recover order', () => void act(`payments/attempts/${r.id}/recover`))}
                      {r.payment_id && !['refunded', 'refund_pending'].includes(String(r.status))
                        ? button('Refund unfulfilled payment', async () => {
                            if (
                              await confirmAction('Refund this captured payment instead of fulfilling the order?')
                            )
                              void act(`payments/attempts/${r.id}/refund`);
                          })
                        : null}
                    </>
                  ) : (
                    <Link to="/admin/orders">View orders</Link>
                  )
                }
              />
            </section>
          </>
        ) : null}

        {section === 'returns' ? (
          <>
            <h2>Item returns</h2>
            <Table
              empty="No item returns are waiting."
              rows={cases}
              actions={(r) => (
                <>
                  {(r.status === 'requested'
                    ? ['approve', 'decline']
                    : r.status === 'approved'
                      ? ['receive']
                      : []
                  ).map((action) => (
                    <span key={action}>
                      {button(action, () => {
                        void askText({
                          title:
                            action === 'receive'
                              ? 'Record inspection'
                              : action === 'approve'
                                ? 'Approve return'
                                : 'Decline return',
                          label: action === 'receive' ? 'Inspection outcome' : 'Pickup reference or decision note',
                          multiline: true,
                          confirmText: 'Save',
                        }).then((note) => {
                          if (note)
                            api
                              .post('/returns/admin/' + r.id, { action, note })
                              .then(() => load())
                              .catch((e) => setError(e.message));
                        });
                      })}
                    </span>
                  ))}
                </>
              )}
            />
            <h2>Whole-order returns</h2>
            <p className="muted">
              Approve a request, arrange pickup, then record inspection before marking it returned. Stock and refund
              records are updated together.
            </p>
            <Table
              empty="No whole-order returns are waiting."
              rows={data.rows}
              actions={(r) => (
                <>
                  {(r.status === 'return_requested'
                    ? [
                        ['Approve pickup', 'return_approved'],
                        ['Decline', 'delivered'],
                      ]
                    : r.status === 'return_approved'
                      ? [['Received and inspected', 'returned']]
                      : []
                  ).map(([label, status]) => (
                    <span key={status}>
                      {button(label, () => {
                        void askText({
                          title: label,
                          label: 'Decision / pickup / inspection note',
                          multiline: true,
                          confirmText: 'Save',
                        }).then((note) => {
                          if (note) void act(`returns/${r.id}`, { status, note });
                        });
                      })}
                    </span>
                  ))}
                </>
              )}
            />
          </>
        ) : null}

        {section === 'reports' ? (
          <>
            <div className="erp-stats">
              {Object.entries(data.stats || {}).map(([k, v]) => (
                <div className="erp-stat" key={k}>
                  <strong>{value(v)}</strong>
                  <span>{labelize(k)}</span>
                </div>
              ))}
            </div>
            <section className="ops-section">
              <h2>Daily order value</h2>
              <Table rows={data.trend} />
            </section>
            <section className="ops-section">
              <h2>Best sellers</h2>
              <Table rows={data.bestsellers} />
            </section>
            <div className="ops-form-actions">
              <a className="erp-btn" href={`/api/operations/orders/export?from=${from}&to=${to}`}>
                Export orders CSV
              </a>
            </div>
          </>
        ) : null}

        {!['payments', 'returns', 'reports', 'settings', 'products'].includes(section) ? (
          <Table
            rows={data.rows}
            hide={section === 'emails' ? ['id'] : section === 'audit' ? ['actor_id', 'details'] : undefined}
            actions={
              section === 'customers'
                ? (r) => button('View customer', () => void customer(String(r.id)))
                : section === 'emails'
                  ? (r) => (!r.sent ? button('Retry delivery', () => void act(`emails/${r.id}/retry`)) : null)
                  : undefined
            }
          />
        ) : null}

        {section === 'gifts' ? (
          <>
            <h2>Gift-card transactions</h2>
            <Table rows={data.transactions} />
          </>
        ) : null}

        {section === 'products' ? (
          <>
            <h2>Catalogue tools</h2>
            <p className="muted">
              Export the CSV as a template. Keep IDs to update products; leave IDs empty to create products. Imports are
              validated together before saving.
            </p>
            <div className="ops-form-actions" style={{ marginBottom: '1rem' }}>
              <a className="erp-btn" href="/api/operations/products/export">
                Export products CSV
              </a>
              <label className="erp-btn">
                Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={busy}
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file && (await confirmAction('Import this CSV and update the listed products?')))
                      await act('products/import', { csv: await file.text() });
                  }}
                />
              </label>
            </div>
            <form
              className="ops-form"
              onSubmit={(e) => {
                const f = form(e);
                void act('products/bulk', { ...f, ids: String(f.ids).split(',').map(Number) });
              }}
            >
              <label>
                Product IDs, comma separated
                <input name="ids" required />
              </label>
              <label>
                Action
                <select name="action">
                  <option value="publish">Publish</option>
                  <option value="hide">Hide</option>
                  <option value="price">Set sale price</option>
                  <option value="category">Add category</option>
                </select>
              </label>
              <label>
                Price or category ID
                <input name="value" type="number" min="0" />
              </label>
              <div className="ops-form-actions">
                <button className="erp-btn primary" disabled={busy}>
                  Apply bulk update
                </button>
              </div>
            </form>
          </>
        ) : null}

        {!['settings', 'payments', 'products', 'reports', 'returns', 'gifts'].includes(section) ? (
          <div className="erp-toolbar">
            {button('Previous', () => setPage((p) => Math.max(1, p - 1)))}
            <span>Page {page}</span>
            {button('Next', () => setPage((p) => p + 1))}
          </div>
        ) : null}
      </div>

      {history.length > 0 ? (
        <div className="erp-card ops-panel">
          <h2>Stock movement history</h2>
          <Table rows={history} />
        </div>
      ) : null}

      {detail ? (
        <div className="erp-card ops-panel" id="ops-customer-detail">
          <div className="erp-toolbar">
            <h2 style={{ margin: 0 }}>Customer</h2>
            <button type="button" className="erp-btn ghost" onClick={() => setDetail(null)}>
              Close
            </button>
          </div>
          {detail.customer ? (
            <dl className="erp-customer-meta">
              <div>
                <dt>Name</dt>
                <dd>{String((detail.customer as Row).name || '—')}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{String((detail.customer as Row).email || '—')}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{String((detail.customer as Row).phone || '—')}</dd>
              </div>
              <div>
                <dt>Orders</dt>
                <dd>{(detail.orders || []).length}</dd>
              </div>
            </dl>
          ) : null}
          <h3>Orders</h3>
          {(detail.orders || []).length ? (
            <Table rows={detail.orders} />
          ) : (
            <p className="muted">No orders yet for this customer.</p>
          )}
          <h3>Internal notes</h3>
          {(detail.notes || []).length ? (
            <Table rows={detail.notes} />
          ) : (
            <p className="muted">No internal notes yet.</p>
          )}
          <form
            className="ops-form"
            onSubmit={async (e) => {
              if (await act(`customers/${customerId}/notes`, form(e))) await customer(customerId);
            }}
          >
            <label>
              Note
              <textarea name="note" required maxLength={2000} />
            </label>
            <div className="ops-form-actions">
              <button className="erp-btn primary">Add internal note</button>
            </div>
          </form>
        </div>
      ) : null}

      {section === 'settings' ? (
        <div className="erp-card ops-panel">
          <h2>Delivery coverage</h2>
          <p className="muted">
            Add serviceable pincodes when “Deliver only to configured pincodes” is on. Shipping is the fee for that
            pincode; ETA is days to deliver.
          </p>
          <form className="ops-form settings-pincode-form" onSubmit={(e) => void act('settings/pincodes', form(e), 'put')}>
            <label>
              Pincode
              <input name="pincode" required inputMode="numeric" maxLength={6} placeholder="636001" />
            </label>
            <label>
              City
              <input name="city" required placeholder="Salem" />
            </label>
            <label>
              State
              <input name="state" required placeholder="Tamil Nadu" />
            </label>
            <label>
              Shipping (₹)
              <input name="shipping" required type="number" min="0" step="0.01" defaultValue="40" />
            </label>
            <label>
              ETA (days)
              <input name="etaDays" required type="number" min="0" step="1" defaultValue="3" />
            </label>
            <div className="ops-form-actions">
              <button className="erp-btn primary">Save pincode</button>
              {button('Show delivery pincodes', () => {
                api
                  .get('/operations/settings/pincodes')
                  .then((r) => setHistory(r.data.rows))
                  .catch((e) => setError(e.message));
              })}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
