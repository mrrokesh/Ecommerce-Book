import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { formatPrice } from '../utils/format';

type Customer = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role?: string;
  createdAt?: string;
  orderCount?: number;
  spent?: number;
};

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  payment_status: string;
  created_at: string;
};

type NoteRow = {
  id: number;
  note: string;
  actor?: string | null;
  created_at: string;
};

type Detail = {
  customer: { id: string; name: string; email: string; phone?: string | null };
  orders: OrderRow[];
  notes: NoteRow[];
};

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [note, setNote] = useState('');
  const detailRef = useRef<HTMLDivElement>(null);

  function load() {
    setError('');
    api
      .get('/admin/customers', { params: { q } })
      .then(({ data }) => setCustomers(data.customers || []))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openCustomer(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.get(`/operations/customers/${id}`);
      if (!data?.customer) throw new Error('Customer not found');
      setDetail({
        customer: data.customer,
        orders: data.orders || [],
        notes: data.notes || [],
      });
      setNote('');
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (err) {
      setDetail(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!detail?.customer?.id || !note.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post(`/operations/customers/${detail.customer.id}/notes`, { note: note.trim() });
      setNotice('Note saved.');
      await openCustomer(detail.customer.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-stack">
      <div className="erp-card">
        <form
          className="erp-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <input type="search" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="erp-btn ghost" type="submit">
            Search
          </button>
        </form>
        {error ? (
          <p className="erp-error" style={{ margin: '0.75rem' }} role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="erp-ok" style={{ margin: '0.75rem' }} role="status">
            {notice}
          </p>
        ) : null}
        <table className="erp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Orders</th>
              <th>Spent</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className={detail?.customer?.id === c.id ? 'is-selected' : undefined}>
                <td>
                  {c.name} {c.role === 'admin' ? <span className="erp-pill off">admin</span> : null}
                  {c.role === 'staff' ? <span className="erp-pill info">staff</span> : null}
                </td>
                <td>{c.email}</td>
                <td>{c.phone || '—'}</td>
                <td>{c.orderCount ?? 0}</td>
                <td>{formatPrice(c.spent || 0)}</td>
                <td>{c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : '—'}</td>
                <td>
                  <button type="button" className="erp-btn" disabled={busy} onClick={() => void openCustomer(c.id)}>
                    View customer
                  </button>
                </td>
              </tr>
            ))}
            {!customers.length ? (
              <tr>
                <td colSpan={7} className="muted">
                  No customers found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {detail ? (
        <div className="erp-card ops-panel" ref={detailRef}>
          <div className="erp-toolbar" style={{ marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>Customer</h2>
            <button type="button" className="erp-btn ghost" onClick={() => setDetail(null)}>
              Close
            </button>
          </div>
          <dl className="erp-customer-meta">
            <div>
              <dt>Name</dt>
              <dd>{detail.customer.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${detail.customer.email}`}>{detail.customer.email}</a>
              </dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{detail.customer.phone || '—'}</dd>
            </div>
            <div>
              <dt>Orders</dt>
              <dd>{detail.orders.length}</dd>
            </div>
          </dl>

          <h3>Orders</h3>
          {detail.orders.length ? (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Total</th>
                  <th>Placed</th>
                </tr>
              </thead>
              <tbody>
                {detail.orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to="/admin/orders">{o.order_number}</Link>
                    </td>
                    <td>{o.status}</td>
                    <td>{o.payment_status}</td>
                    <td>{formatPrice(Number(o.total))}</td>
                    <td>{new Date(o.created_at).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No orders yet for this customer.</p>
          )}

          <h3>Internal notes</h3>
          {detail.notes.length ? (
            <ul className="erp-note-list">
              {detail.notes.map((n) => (
                <li key={n.id}>
                  <p>{n.note}</p>
                  <small>
                    {n.actor || 'Staff'} · {new Date(n.created_at).toLocaleString('en-IN')}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No internal notes yet.</p>
          )}
          <form className="ops-form" onSubmit={(e) => void addNote(e)}>
            <label>
              Add note
              <textarea name="note" required maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </label>
            <button className="erp-btn primary" disabled={busy || !note.trim()}>
              Save note
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
