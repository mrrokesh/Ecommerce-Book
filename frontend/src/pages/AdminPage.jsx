import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/format';
import { LoadingState, EmptyState } from '../components/States';

export default function AdminPage() {
  const { user, loading, isAuthenticated } = useAuth();
  const [summary, setSummary] = useState(null);
  const [books, setBooks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', authorName: '', mrp: '', salePrice: '', stock: '10' });

  const [banners, setBanners] = useState([]);
  const [pages, setPages] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [emails, setEmails] = useState([]);
  const [banner, setBanner] = useState({ title: '', subtitle: '', link: '/shop' });
  const [coupon, setCoupon] = useState({ code: '', percentOff: '10', minOrder: '199' });
  const [editPage, setEditPage] = useState(null);

  function load() {
    Promise.all([
      api.get('/admin/summary'),
      api.get('/admin/books'),
      api.get('/admin/orders'),
      api.get('/admin/banners'),
      api.get('/admin/pages'),
      api.get('/admin/coupons'),
      api.get('/admin/emails'),
    ])
      .then(([s, b, o, ba, p, c, e]) => {
        setSummary(s.data);
        setBooks(b.data.books || []);
        setOrders(o.data.orders || []);
        setBanners(ba.data.banners || []);
        setPages(p.data.pages || []);
        setCoupons(c.data.coupons || []);
        setEmails(e.data.emails || []);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (user?.role === 'admin') load();
  }, [user]);

  if (loading) return <LoadingState />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <EmptyState title="Admin only" message="Sign in as admin@salembookhouse.com" />;

  async function addProduct(e) {
    e.preventDefault();
    await api.post('/admin/books', {
      ...form,
      mrp: Number(form.mrp),
      salePrice: Number(form.salePrice || form.mrp),
      stock: Number(form.stock),
    });
    setForm({ title: '', authorName: '', mrp: '', salePrice: '', stock: '10' });
    load();
  }

  async function setStatus(id, status) {
    await api.patch(`/admin/orders/${id}`, { status });
    load();
  }

  return (
    <div className="container admin-page">
      <h1>Store Admin</h1>
      {error ? <p className="form-error">{error}</p> : null}
      {summary?.stats ? (
        <div className="admin-stats">
          <div>
            <strong>{summary.stats.books}</strong>
            <span>Products</span>
          </div>
          <div>
            <strong>{summary.stats.orders}</strong>
            <span>Orders</span>
          </div>
          <div>
            <strong>{summary.stats.users}</strong>
            <span>Users</span>
          </div>
          <div>
            <strong>{formatPrice(summary.stats.revenue)}</strong>
            <span>Revenue</span>
          </div>
        </div>
      ) : null}

      <h2>Add product</h2>
      <form className="checkout-form" onSubmit={addProduct}>
        <div className="form-row">
          <label>
            Title
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label>
            Author
            <input required value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} />
          </label>
        </div>
        <div className="form-row">
          <label>
            MRP
            <input required type="number" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} />
          </label>
          <label>
            Sale
            <input type="number" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
          </label>
          <label>
            Stock
            <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          </label>
        </div>
        <button className="btn btn-gold" type="submit">
          Save product
        </button>
      </form>

      <h2>Orders</h2>
      <table className="exam-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Status</th>
            <th>Pay</th>
            <th>Total</th>
            <th>Update</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.orderNumber}</td>
              <td>{o.status}</td>
              <td>
                {o.paymentMethod} / {o.paymentStatus}
              </td>
              <td>{formatPrice(o.total)}</td>
              <td>
                <select value={o.status} onChange={(e) => setStatus(o.id, e.target.value)}>
                  {['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'].map((s) => (
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

      <h2>Catalogue ({books.length})</h2>
      <ul className="plain-list">
        {books.slice(0, 40).map((b) => (
          <li key={b.id}>
            {b.title} — {formatPrice(b.salePrice)} · stock {b.stock}
          </li>
        ))}
      </ul>

      <h2>Banners</h2>
      <form
        className="checkout-form"
        onSubmit={async (e) => {
          e.preventDefault();
          await api.post('/admin/banners', banner);
          setBanner({ title: '', subtitle: '', link: '/shop' });
          load();
        }}
      >
        <label>
          Title
          <input required value={banner.title} onChange={(e) => setBanner({ ...banner, title: e.target.value })} />
        </label>
        <label>
          Subtitle
          <input value={banner.subtitle} onChange={(e) => setBanner({ ...banner, subtitle: e.target.value })} />
        </label>
        <button className="btn btn-gold" type="submit">
          Add banner
        </button>
      </form>
      <ul className="plain-list">
        {banners.map((b) => (
          <li key={b.id}>
            {b.title} {b.isActive ? '' : '(hidden)'}
            <button
              type="button"
              className="text-btn"
              onClick={() => api.patch(`/admin/banners/${b.id}`, { isActive: !b.isActive }).then(load)}
            >
              toggle
            </button>
          </li>
        ))}
      </ul>

      <h2>CMS pages</h2>
      {pages.map((p) => (
        <form
          key={p.slug}
          className="checkout-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const cur = editPage?.slug === p.slug ? editPage : p;
            await api.put(`/admin/pages/${p.slug}`, { title: cur.title, body: cur.body });
            load();
          }}
        >
          <h3>{p.slug}</h3>
          <label>
            Title
            <input
              value={editPage?.slug === p.slug ? editPage.title : p.title}
              onChange={(e) => setEditPage({ ...(editPage?.slug === p.slug ? editPage : p), title: e.target.value })}
            />
          </label>
          <label>
            Body
            <textarea
              rows={5}
              value={editPage?.slug === p.slug ? editPage.body : p.body}
              onChange={(e) => setEditPage({ ...(editPage?.slug === p.slug ? editPage : p), body: e.target.value })}
            />
          </label>
          <button className="btn btn-navy" type="submit">
            Save page
          </button>
        </form>
      ))}

      <h2>Coupons</h2>
      <form
        className="checkout-form"
        onSubmit={async (e) => {
          e.preventDefault();
          await api.post('/admin/coupons', coupon);
          load();
        }}
      >
        <div className="form-row">
          <label>
            Code
            <input required value={coupon.code} onChange={(e) => setCoupon({ ...coupon, code: e.target.value })} />
          </label>
          <label>
            % off
            <input value={coupon.percentOff} onChange={(e) => setCoupon({ ...coupon, percentOff: e.target.value })} />
          </label>
          <label>
            Min order
            <input value={coupon.minOrder} onChange={(e) => setCoupon({ ...coupon, minOrder: e.target.value })} />
          </label>
        </div>
        <button className="btn btn-gold" type="submit">
          Save coupon
        </button>
      </form>
      <ul className="plain-list">
        {coupons.map((c) => (
          <li key={c.id}>
            {c.code} — {c.percentOff ? `${c.percentOff}%` : formatPrice(c.amountOff)} (min {formatPrice(c.minOrder)})
          </li>
        ))}
      </ul>

      <h2>Image upload</h2>
      <input
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.append('file', file);
          const { data } = await api.post('/admin/upload', fd);
          setError(`Uploaded: ${data.url}`);
        }}
      />

      <h2>Email outbox</h2>
      <p className="muted">Messages are stored here. SMTP sends them when SMTP_HOST is set.</p>
      <ul className="plain-list">
        {emails.map((m) => (
          <li key={m.id}>
            {m.sent ? 'sent' : 'queued'} — {m.to}: {m.subject}
          </li>
        ))}
      </ul>
    </div>
  );
}
