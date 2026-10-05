import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api/client';
import { formatPrice } from '../utils/format';

export default function TrackPage() {
  const location = useLocation();
  const [orderNumber, setOrderNumber] = useState(location.state?.orderNumber || '');
  const [phone, setPhone] = useState(location.state?.phone || '');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (location.state?.orderNumber && location.state?.phone) {
      setBusy(true);
      api
        .get('/orders/track', {
          params: { orderNumber: location.state.orderNumber, phone: location.state.phone },
        })
        .then(({ data }) => setOrder(data.order))
        .catch((err) => setError(err.message))
        .finally(() => setBusy(false));
    }
  }, [location.state]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOrder(null);
    try {
      const { data } = await api.get('/orders/track', { params: { orderNumber, phone } });
      setOrder(data.order);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container cms-page">
      <h1>Track your Order</h1>
      <form className="checkout-form" onSubmit={onSubmit} style={{ maxWidth: 480 }}>
        <label>
          Order number
          <input required value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="SBH-…" />
        </label>
        <label>
          Phone on the order
          <input required value={phone} onChange={(e) => setPhone(e.target.value)} />
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
        </div>
      ) : null}
    </div>
  );
}
