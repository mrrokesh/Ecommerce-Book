import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/format';
import { EmptyState, LoadingState } from '../components/States';

export default function OrdersPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  function loadOrders() {
    return api.get('/orders').then(({ data }) => {
      setOrders(data.orders || data || []);
    });
  }

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let alive = true;
    setLoading(true);
    loadOrders()
      .catch((err) => {
        if (!alive) return;
        setError(err.message || 'Failed to load orders');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  function openAction(order, type) {
    setActingId(order.id);
    setActionType(type);
    setReason('');
    setActionError('');
  }

  function closeAction() {
    setActingId(null);
    setActionType(null);
    setReason('');
    setActionError('');
  }

  async function submitAction(e) {
    e.preventDefault();
    if (!actingId || !actionType) return;
    setBusy(true);
    setActionError('');
    try {
      const path = actionType === 'cancel' ? `/orders/${actingId}/cancel` : `/orders/${actingId}/return`;
      const { data } = await api.patch(path, { reason });
      const updated = data.order;
      setOrders((list) => list.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
      closeAction();
      if (actionType === 'return') {
        window.alert('Return requested. We will review it and confirm by email.');
      }
    } catch (err) {
      setActionError(err.message || 'Could not update order');
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) return <LoadingState />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="orders-page container">
      <h1>My Orders</h1>
      {location.state?.justPlaced ? (
        <p className="notice success">
          Order placed successfully
          {typeof location.state.justPlaced === 'string' ? ` (#${location.state.justPlaced})` : ''}!
        </p>
      ) : null}
      {location.state?.giftCodes?.length ? (
        <p className="notice success">
          Gift card codes: {location.state.giftCodes.map((g) => g.code).join(', ')}
        </p>
      ) : null}
      {loading ? (
        <LoadingState label="Loading orders…" />
      ) : error ? (
        <EmptyState title="Could not load orders" message={error} />
      ) : !orders.length ? (
        <EmptyState
          title="No orders yet"
          message="Your past orders will show up here."
          action={<Link to="/shop">Start shopping</Link>}
        />
      ) : (
        <div className="orders-list">
          {orders.map((order) => (
            <article key={order.id} className="order-card">
              <div className="order-head">
                <div>
                  <h3>Order #{order.order_number || order.orderNumber}</h3>
                  <p className="muted">
                    {order.created_at || order.createdAt
                      ? new Date(order.created_at || order.createdAt).toLocaleString('en-IN')
                      : ''}
                  </p>
                </div>
                <span className={`order-status status-${order.status}`}>
                  {String(order.status || '').replace(/_/g, ' ')}
                </span>
              </div>
              <ul>
                {(order.items || []).map((item) => (
                  <li key={item.id}>
                    {item.title} × {item.quantity} — {formatPrice(item.line_total ?? item.lineTotal)}
                  </li>
                ))}
              </ul>
              <p className="order-total">
                Total: <strong>{formatPrice(order.total)}</strong>
                {order.paymentStatus ? (
                  <span className="muted"> · {order.paymentMethod} ({order.paymentStatus})</span>
                ) : null}
              </p>
              <div className="order-actions">
                <Link
                  to={`/track`}
                  state={{ orderNumber: order.orderNumber || order.order_number, phone: order.shippingPhone }}
                >
                  Track
                </Link>
                {order.canCancel ? (
                  <button type="button" className="text-btn" onClick={() => openAction(order, 'cancel')}>
                    Cancel order
                  </button>
                ) : null}
                {order.canReturn ? (
                  <button type="button" className="text-btn" onClick={() => openAction(order, 'return')}>
                    Return
                  </button>
                ) : null}
              </div>
              {actingId === order.id ? (
                <form className="order-action-form" onSubmit={submitAction}>
                  <p>
                    {actionType === 'cancel'
                      ? 'Cancel before dispatch. Items go back to stock. Paid orders are marked refunded (simulated).'
                      : 'Return within 7 days of delivery. Unused items only. We review each request before refunding.'}
                  </p>
                  <label>
                    {actionType === 'return' ? 'Reason (required)' : 'Reason (optional)'}
                    <textarea
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required={actionType === 'return'}
                      placeholder={actionType === 'return' ? 'Damaged, wrong title, changed mind…' : 'Optional'}
                    />
                  </label>
                  {actionError ? <p className="form-error">{actionError}</p> : null}
                  <div className="order-actions">
                    <button className="btn btn-navy" type="submit" disabled={busy}>
                      {busy ? 'Updating…' : actionType === 'cancel' ? 'Confirm cancel' : 'Confirm return'}
                    </button>
                    <button type="button" className="btn btn-outline" onClick={closeAction} disabled={busy}>
                      Close
                    </button>
                  </div>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
