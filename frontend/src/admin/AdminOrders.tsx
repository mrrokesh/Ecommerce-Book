import { useEffect, useState } from 'react';
import api from '../api/client';
import CoverImage from '../components/CoverImage';
import { formatPrice } from '../utils/format';

const STATUSES = [
  'placed',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'return_requested',
  'returned',
];
const PAYMENT_STATUSES = ['pending', 'paid', 'refunded', 'cancelled'];

function statusPill(status) {
  if (['delivered', 'confirmed'].includes(status)) return 'ok';
  if (['cancelled', 'returned'].includes(status)) return 'off';
  return 'warn';
}

function OrderDetail({ id, onChanged, onClose }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    api
      .get(`/admin/orders/${id}`)
      .then(({ data }) => setOrder(data.order))
      .catch((err) => setError(err.message));
  }, [id]);

  async function update(patch) {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.patch(`/admin/orders/${id}`, { ...patch, note: note.trim() || undefined });
      setOrder(data.order);
      setNote('');
      onChanged(data.order);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createShipment() {
    setBusy(true);
    setError('');
    try {
      const awbMatch = note.match(/AWB[:\s]*([A-Z0-9-]+)/i);
      const { data } = await api.post(`/shipping/admin/orders/${id}/ship`, {
        awb: awbMatch?.[1] || undefined,
        trackingUrl: undefined,
      });
      const refreshed = await api.get(`/admin/orders/${id}`);
      setOrder(refreshed.data.order);
      onChanged(refreshed.data.order);
      setNote('');
      if (data.result?.message) setError(''); // clear
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <div className="erp-card erp-detail">
        {error ? <p className="erp-error">{error}</p> : <p className="muted">Loading order…</p>}
      </div>
    );
  }

  return (
    <div className="erp-card erp-detail">
      <div className="erp-toolbar" style={{ padding: 0, border: 0 }}>
        <strong>{order.orderNumber}</strong>
        <span className={`erp-pill ${statusPill(order.status)}`}>{order.status}</span>
        <span className="erp-grow" />
        <button type="button" className="erp-btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
      {error ? <p className="erp-error">{error}</p> : null}
      <p>
        <strong>{order.shippingName}</strong> · {order.shippingPhone}
        {order.email ? ` · ${order.email}` : ''}
        <br />
        <span className="muted">{order.shippingAddress}</span>
        <br />
        {order.courier || order.awb ? (
          <span className="muted">
            Courier: {order.courier || '—'} · AWB: {order.awb || 'pending'}
            {order.trackingUrl ? (
              <>
                {' '}
                ·{' '}
                <a href={order.trackingUrl} target="_blank" rel="noreferrer">
                  Track
                </a>
              </>
            ) : null}
          </span>
        ) : (
          <span className="muted">No shipment yet</span>
        )}
        {order.invoiceNumber ? (
          <>
            <br />
            <a href={`/api/orders/${order.id}/invoice`} target="_blank" rel="noreferrer">
              Invoice {order.invoiceNumber}
            </a>
          </>
        ) : null}
      </p>
      <button type="button" className="erp-btn primary" disabled={busy} onClick={createShipment}>
        {order.awb ? 'Refresh / re-ship' : 'Create shipment'}
      </button>
      <table className="erp-table">
        <tbody>
          {order.items.map((it) => (
            <tr key={it.id}>
              <td>
                <CoverImage className="erp-thumb" book={it} alt="" />
              </td>
              <td>
                {it.title}
                <div className="muted">{it.authorName}</div>
              </td>
              <td>
                {it.quantity} × {formatPrice(it.unitPrice)}
              </td>
              <td>{formatPrice(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Subtotal {formatPrice(order.subtotal)} · Discount {formatPrice(order.discount)}
        {order.couponCode ? ` (${order.couponCode})` : ''} · Shipping {formatPrice(order.shipping)} ·{' '}
        <strong>Total {formatPrice(order.total)}</strong>
      </p>
      <div className="form-row">
        <label>
          Order status
          <select value={order.status} disabled={busy} onChange={(e) => update({ status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Payment ({order.paymentMethod})
          <select
            value={order.paymentStatus || 'pending'}
            disabled={busy}
            onChange={(e) => update({ paymentStatus: e.target.value })}
          >
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Note for next update (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. AWB 12345 via DTDC" />
        </label>
      </div>
      <p className="muted">Cancelling or returning puts the items back in stock. Re-opening reserves them again.</p>
      <h3>Timeline</h3>
      <ul className="erp-timeline">
        {order.events.map((e, i) => (
          <li key={i}>
            <strong>{e.status}</strong> — {e.note}{' '}
            <span className="muted">{new Date(e.createdAt).toLocaleString('en-IN')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  function load(nextPage = 1) {
    setError('');
    api
      .get('/admin/orders', { params: { q, status, page: nextPage, pageSize: 25 } })
      .then(({ data }) => {
        setOrders(data.orders || []);
        setPage(data.page || 1);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load(1);
    // q is applied on submit only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function onChanged(updated) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {selected ? <OrderDetail key={selected} id={selected} onChanged={onChanged} onClose={() => setSelected(null)} /> : null}
      <div className="erp-card">
        <form
          className="erp-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            load(1);
          }}
        >
          <input
            type="search"
            placeholder="Order no, name, phone or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="erp-btn ghost" type="submit">
            Search
          </button>
          <span className="erp-grow" />
          <button className="erp-btn ghost" type="button" onClick={() => load(page)}>
            Refresh
          </button>
        </form>
        {error ? <p className="erp-error" style={{ padding: '0.75rem' }}>{error}</p> : null}
        <table className="erp-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Payment</th>
              <th>Total</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.orderNumber}</td>
                <td>{new Date(o.createdAt).toLocaleDateString('en-IN')}</td>
                <td>
                  {o.shippingName || '—'}
                  <div className="muted">{o.email || o.shippingPhone}</div>
                </td>
                <td>{o.itemCount ?? '—'}</td>
                <td>
                  {o.paymentMethod} / {o.paymentStatus}
                </td>
                <td>{formatPrice(o.total)}</td>
                <td>
                  <span className={`erp-pill ${statusPill(o.status)}`}>{o.status}</span>
                </td>
                <td>
                  <button type="button" className="erp-btn ghost" onClick={() => setSelected(o.id)}>
                    Manage
                  </button>
                </td>
              </tr>
            ))}
            {!orders.length ? (
              <tr>
                <td colSpan={8} className="muted">
                  No orders match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="erp-pager">
          <span>
            {total} orders · page {page} of {totalPages}
          </span>
          <div className="erp-actions">
            <button className="erp-btn ghost" type="button" disabled={page <= 1} onClick={() => load(page - 1)}>
              Previous
            </button>
            <button
              className="erp-btn ghost"
              type="button"
              disabled={page >= totalPages}
              onClick={() => load(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
