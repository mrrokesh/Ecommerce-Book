import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/format';
import AdminIcon from './AdminIcon';

type Summary = {
  stats: Record<string, number>;
  recentOrders: { id: string; orderNumber: string; status: string; total: number; paymentMethod: string }[];
  lowStockItems?: { id: number; title: string; stock: number }[];
};

const STATUS_TONE: Record<string, string> = {
  placed: 'warn', confirmed: 'info', packed: 'info', shipped: 'info', out_for_delivery: 'info',
  delivered: 'ok', cancelled: 'bad', returned: 'bad', return_requested: 'warn', return_approved: 'warn',
};

function Count({ value, label, to }: { value: number; label: string; to: string }) {
  return (
    <Link to={to} className="dash-count">
      <strong className={value > 0 ? 'has' : ''}>{value}</strong>
      <span>{label}</span>
    </Link>
  );
}

function Card({ title, icon, tone = 'blue', action, children }: { title: string; icon: string; tone?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="dash-card">
      <header>
        <span className={`dash-chip ${tone}`}><AdminIcon name={icon} size={16} /></span>
        <h2>{title}</h2>
        {action ? <span className="dash-action">{action}</span> : null}
      </header>
      {children}
    </section>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState(0);

  function load() {
    api
      .get('/admin/summary')
      .then(({ data }) => { setSummary(data); setLoadedAt(Date.now()); setError(''); })
      .catch((err) => {
        const msg = err.message || 'Failed to load dashboard';
        setError(/auth/i.test(msg) ? 'Session is not reaching the API. Sign out, wait for the latest deploy, then sign in again.' : msg);
      });
  }
  useEffect(load, []);

  if (error) return <p className="erp-error">{error}</p>;
  if (!summary) return <p className="muted">Loading dashboard…</p>;
  const s = summary.stats;
  const first = String(user?.name || 'there').split(/\s+/)[0];

  return (
    <div className="dash">
      <div className="dash-hello">
        <div>
          <h2>Hello, {first}</h2>
          <span className="muted">Updated {loadedAt ? new Date(loadedAt).toLocaleTimeString() : 'just now'}</span>
        </div>
        <button type="button" className="erp-btn" onClick={load}>Refresh</button>
      </div>

      <div className="dash-kpis">
        <div className="dash-kpi"><span>Today's orders</span><strong>{s.todayOrders ?? 0}</strong><small>{formatPrice(s.todayRevenue ?? 0)} so far</small></div>
        <div className="dash-kpi"><span>Revenue (paid)</span><strong>{formatPrice(s.revenue)}</strong><small>{s.orders} orders in total</small></div>
        <div className="dash-kpi"><span>Customers</span><strong>{s.users}</strong><small>{s.subscribers ?? 0} subscribed to offers</small></div>
        <div className="dash-kpi"><span>Products</span><strong>{s.books}</strong><small>{s.lowStock ?? 0} low on stock</small></div>
      </div>

      <div className="dash-grid">
        <Card title="Pending actions" icon="alert" tone="orange">
          <div className="dash-counts">
            <Count value={s.toConfirm ?? 0} label="To confirm" to="/admin/orders" />
            <Count value={s.toShip ?? 0} label="To ship" to="/admin/orders" />
            <Count value={s.inTransit ?? 0} label="In transit" to="/admin/orders" />
            <Count value={s.returnsOpen ?? 0} label="Returns open" to="/admin/returns" />
            <Count value={s.refundsOpen ?? 0} label="Refunds pending" to="/admin/payments" />
          </div>
        </Card>

        <Card title="Low stock" icon="box" tone="red" action={<Link to="/admin/inventory">Inventory</Link>}>
          {summary.lowStockItems?.length ? (
            <ul className="dash-list">
              {summary.lowStockItems.map((b) => (
                <li key={b.id}>
                  <Link to={`/admin/products/${b.id}`}>{b.title}</Link>
                  <span className={b.stock <= 0 ? 'bad' : 'warn'}>{b.stock <= 0 ? `${b.stock} left` : `${b.stock} left`} &middot; reorder at 5</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted dash-empty">Everything is well stocked.</p>}
        </Card>

        <Card title="Recent orders" icon="sales" tone="blue" action={<Link to="/admin/orders">View all</Link>}>
          <div className="ops-table">
            <table className="erp-table">
              <thead><tr><th>Order</th><th>Status</th><th>Payment</th><th className="num">Total</th></tr></thead>
              <tbody>
                {(summary.recentOrders || []).map((o) => (
                  <tr key={o.id}>
                    <td>{o.orderNumber}</td>
                    <td><span className={`erp-pill ${STATUS_TONE[o.status] || ''}`}>{o.status.replace(/_/g, ' ')}</span></td>
                    <td>{String(o.paymentMethod || '').toUpperCase()}</td>
                    <td className="num">{formatPrice(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Quick actions" icon="trend" tone="green">
          <div className="dash-quick">
            <Link to="/admin/products/new" className="erp-btn">Add product</Link>
            <Link to="/admin/marketing" className="erp-btn">New coupon</Link>
            <Link to="/admin/campaigns" className="erp-btn primary">Send an offer email</Link>
            <Link to="/admin/reports" className="erp-btn">Sales reports</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
