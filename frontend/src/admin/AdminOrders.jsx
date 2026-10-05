import { useEffect, useState } from 'react';
import api from '../api/client';
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

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');

  function load() {
    api
      .get('/admin/orders')
      .then(({ data }) => setOrders(data.orders || []))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="erp-card">
      {error ? <p className="erp-error" style={{ padding: '0.75rem' }}>{error}</p> : null}
      <table className="erp-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Payment</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.orderNumber}</td>
              <td>{o.shippingName || '—'}</td>
              <td>
                {o.paymentMethod} / {o.paymentStatus}
              </td>
              <td>{formatPrice(o.total)}</td>
              <td>
                <select
                  value={o.status}
                  onChange={async (e) => {
                    await api.patch(`/admin/orders/${o.id}`, { status: e.target.value });
                    load();
                  }}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
