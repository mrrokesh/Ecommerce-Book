import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/States';
import { formatPrice } from '../utils/format';

export default function TrackPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const location = useLocation();
  const [orderNumber, setOrderNumber] = useState(location.state?.orderNumber || '');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function lookup(number: string) {
    setBusy(true);
    setError('');
    setOrder(null);
    try {
      const { data } = await api.get('/orders/track', { params: { orderNumber: number } });
      setOrder(data.order);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated && location.state?.orderNumber) lookup(location.state.orderNumber);
  }, [isAuthenticated, location.state]);

  if (authLoading) return <LoadingState />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: '/track' }} replace />;

  function onSubmit(e) {
    e.preventDefault();
    lookup(orderNumber.trim());
  }

  return (
    <div className="container cms-page">
      <h1>Track your Order</h1>
      <form className="checkout-form" onSubmit={onSubmit} style={{ maxWidth: 480 }}>
        <label>
          Order number
          <input required value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="SBH-…" />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn btn-navy" type="submit" disabled={busy}>
          {busy ? 'Looking up…' : 'Track'}
        </button>
      </form>
      {order ? (
        <div className="order-card" style={{ marginTop: '1.5rem' }}>
          <div className="order-head">
            <h3>#{order.orderNumber}</h3>
            <span className="order-status">{order.status}</span>
          </div>
          <p>
            {order.shippingName} · {order.shippingAddress}
          </p>
          {order.awb || order.courier || order.trackingUrl ? (
            <p className="muted">
              {order.courier ? <>Courier: {order.courier} · </> : null}
              {order.awb ? <>AWB: {order.awb} · </> : null}
              {order.trackingUrl ? (
                <a href={order.trackingUrl} target="_blank" rel="noreferrer">
                  Live tracking
                </a>
              ) : null}
            </p>
          ) : null}
          <ul>
            {(order.items || []).map((it) => (
              <li key={it.id}>
                {it.title} × {it.quantity} — {formatPrice(it.lineTotal)}
              </li>
            ))}
          </ul>
          <ol className="track-events">
            {(order.events || []).map((ev, i) => (
              <li key={i}>
                <strong>{ev.status}</strong> — {ev.note}{' '}
                <span className="muted">{ev.createdAt ? new Date(ev.createdAt).toLocaleString('en-IN') : ''}</span>
              </li>
            ))}
          </ol>
          <p className="order-total">
            Total <strong>{formatPrice(order.total)}</strong> ({order.paymentMethod} · {order.paymentStatus})
          </p>
          {order.invoiceNumber ? (
            <p>
              <a href={`/api/orders/${order.id}/invoice`} target="_blank" rel="noreferrer">
                Download invoice {order.invoiceNumber}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
