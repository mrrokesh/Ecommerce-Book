import { useEffect, useState } from 'react';
import api from '../api/client';
import { formatPrice } from '../utils/format';

export default function AdminMarketing() {
  const [banners, setBanners] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [banner, setBanner] = useState({ title: '', subtitle: '', link: '/shop' });
  const [coupon, setCoupon] = useState({ code: '', percentOff: '10', minOrder: '199' });
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

  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error ? <p className="erp-error">{error}</p> : null}
      <div className="erp-card" style={{ padding: '1rem' }}>
        <h2>Banners</h2>
        <form
          className="form-row"
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
          <button className="erp-btn primary" type="submit">
            Add
          </button>
        </form>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {banners.map((b) => (
              <tr key={b.id}>
                <td>{b.title}</td>
                <td>
                  <span className={`erp-pill ${b.isActive ? 'ok' : 'off'}`}>{b.isActive ? 'Live' : 'Hidden'}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="erp-btn ghost"
                    onClick={() => api.patch(`/admin/banners/${b.id}`, { isActive: !b.isActive }).then(load)}
                  >
                    Toggle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="erp-card" style={{ padding: '1rem' }}>
        <h2>Coupons</h2>
        <form
          className="form-row"
          onSubmit={async (e) => {
            e.preventDefault();
            await api.post('/admin/coupons', coupon);
            load();
          }}
        >
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
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td>
                <td>{c.percentOff ? `${c.percentOff}%` : formatPrice(c.amountOff)}</td>
                <td>{formatPrice(c.minOrder)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
