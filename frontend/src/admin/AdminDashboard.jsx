import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { formatPrice } from '../utils/format';

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/admin/summary')
      .then(({ data }) => setSummary(data))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="erp-error">{error}</p>;
  if (!summary) return <p className="muted">Loading dashboard…</p>;

  return (
    <>
      <div className="erp-stats">
        <div className="erp-stat">
          <strong>{summary.stats.books}</strong>
          <span>Products</span>
        </div>
        <div className="erp-stat">
          <strong>{summary.stats.orders}</strong>
          <span>Orders</span>
        </div>
        <div className="erp-stat">
          <strong>{summary.stats.users}</strong>
          <span>Customers</span>
        </div>
        <div className="erp-stat">
          <strong>{formatPrice(summary.stats.revenue)}</strong>
          <span>Revenue</span>
        </div>
      </div>
      <div className="erp-card">
        <div className="erp-toolbar">
          <strong>Recent orders</strong>
          <span className="erp-grow" />
          <Link className="erp-btn primary" to="/admin/products">
            Open products
          </Link>
        </div>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th>Pay</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {(summary.recentOrders || []).map((o) => (
              <tr key={o.id}>
                <td>{o.orderNumber}</td>
                <td>{o.status}</td>
                <td>{o.paymentMethod}</td>
                <td>{formatPrice(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
