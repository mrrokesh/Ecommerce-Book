import { useEffect, useState } from 'react';
import api from '../api/client';
import { formatPrice } from '../utils/format';

const emptyBanner = { title: '', subtitle: '', link: '/shop', imageUrl: '' };
const emptyCoupon = { code: '', description: '', percentOff: '10', amountOff: '', minOrder: '199', expiresAt: '' };

export default function AdminMarketing() {
  const [banners, setBanners] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [banner, setBanner] = useState(emptyBanner);
  const [coupon, setCoupon] = useState(emptyCoupon);
  const [error, setError] = useState('');

  function load() {
    Promise.all([api.get('/admin/banners'), api.get('/admin/coupons')])
      .then(([b, c]) => {
        setBanners(b.data.banners || []);
        setCoupons(c.data.coupons || []);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function run(action) {
    setError('');
    try {
      await action();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error ? <p className="erp-error">{error}</p> : null}
      <div className="erp-card" style={{ padding: '1rem' }}>
        <h2>Banners</h2>
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api.post('/admin/banners', banner);
              setBanner(emptyBanner);
            });
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
          <label>
            Link
            <input value={banner.link} onChange={(e) => setBanner({ ...banner, link: e.target.value })} />
          </label>
          <label>
            Image URL
            <input value={banner.imageUrl} onChange={(e) => setBanner({ ...banner, imageUrl: e.target.value })} />
          </label>
          <button className="erp-btn primary" type="submit">
            Add
          </button>
        </form>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Link</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {banners.map((b) => (
              <tr key={b.id}>
                <td>{b.title}</td>
                <td>{b.link}</td>
                <td>
                  <span className={`erp-pill ${b.isActive ? 'ok' : 'off'}`}>{b.isActive ? 'Live' : 'Hidden'}</span>
                </td>
                <td>
                  <div className="erp-actions">
                    <button
                      type="button"
                      className="erp-btn ghost"
                      onClick={() => run(() => api.patch(`/admin/banners/${b.id}`, { isActive: !b.isActive }))}
                    >
                      {b.isActive ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      className="erp-btn danger"
                      onClick={() => {
                        if (window.confirm(`Delete banner "${b.title}"?`)) {
                          run(() => api.delete(`/admin/banners/${b.id}`));
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="erp-card" style={{ padding: '1rem' }}>
        <h2>Coupons</h2>
        <p className="muted">Use either % off or a flat ₹ amount off. Saving an existing code updates it.</p>
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api.post('/admin/coupons', {
                ...coupon,
                expiresAt: coupon.expiresAt ? new Date(`${coupon.expiresAt}T23:59:59`).toISOString() : null,
              });
              setCoupon(emptyCoupon);
            });
          }}
        >
          <label>
            Code
            <input required value={coupon.code} onChange={(e) => setCoupon({ ...coupon, code: e.target.value })} />
          </label>
          <label>
            Description
            <input
              value={coupon.description}
              onChange={(e) => setCoupon({ ...coupon, description: e.target.value })}
            />
          </label>
          <label>
            % off
            <input
              type="number"
              min="0"
              max="100"
              value={coupon.percentOff}
              onChange={(e) => setCoupon({ ...coupon, percentOff: e.target.value })}
            />
          </label>
          <label>
            ₹ off
            <input
              type="number"
              min="0"
              value={coupon.amountOff}
              onChange={(e) => setCoupon({ ...coupon, amountOff: e.target.value })}
            />
          </label>
          <label>
            Min order
            <input
              type="number"
              min="0"
              value={coupon.minOrder}
              onChange={(e) => setCoupon({ ...coupon, minOrder: e.target.value })}
            />
          </label>
          <label>
            Expires
            <input
              type="date"
              value={coupon.expiresAt}
              onChange={(e) => setCoupon({ ...coupon, expiresAt: e.target.value })}
            />
          </label>
          <button className="erp-btn primary" type="submit">
            Save
          </button>
        </form>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Discount</th>
              <th>Min</th>
              <th>Expires</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.code}
                  {c.description ? <div className="muted">{c.description}</div> : null}
                </td>
                <td>{c.percentOff ? `${c.percentOff}%` : formatPrice(c.amountOff)}</td>
                <td>{formatPrice(c.minOrder)}</td>
                <td>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-IN') : '—'}</td>
                <td>
                  <span className={`erp-pill ${c.active ? 'ok' : 'off'}`}>{c.active ? 'Active' : 'Off'}</span>
                </td>
                <td>
                  <div className="erp-actions">
                    <button
                      type="button"
                      className="erp-btn ghost"
                      onClick={() => run(() => api.patch(`/admin/coupons/${c.id}`, { active: !c.active }))}
                    >
                      {c.active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      className="erp-btn danger"
                      onClick={() => {
                        if (window.confirm(`Delete coupon ${c.code}?`)) run(() => api.delete(`/admin/coupons/${c.id}`));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
