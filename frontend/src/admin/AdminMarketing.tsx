import { useEffect, useState } from 'react';
import api from '../api/client';
import { formatPrice } from '../utils/format';

const emptyBanner = { title: '', subtitle: '', link: '/shop', imageUrl: '' };
const emptyCoupon = { code: '', description: '', percentOff: '10', amountOff: '', minOrder: '199', expiresAt: '', usageLimit: '', perCustomerLimit: '1' };

export default function AdminMarketing() {
  const [banners, setBanners] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [banner, setBanner] = useState(emptyBanner);
  const [coupon, setCoupon] = useState(emptyCoupon);
  const [editBannerId, setEditBannerId] = useState(null);
  const [editCouponId, setEditCouponId] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

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

  async function run(action, success) {
    setBusy(true);
    setError('');
    setOk('');
    try {
      await action();
      load();
      if (success) setOk(success);
    } catch (err) {
      setError(err.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error ? <p className="erp-error">{error}</p> : null}
      {ok ? <p className="notice success">{ok}</p> : null}

      <div className="erp-card" style={{ padding: '1rem' }}>
        <h2>{editBannerId ? 'Edit banner' : 'New banner'}</h2>
        <form
          className="erp-editor"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              if (editBannerId) {
                await api.patch(`/admin/banners/${editBannerId}`, banner);
                setEditBannerId(null);
              } else {
                await api.post('/admin/banners', banner);
              }
              setBanner(emptyBanner);
            }, editBannerId ? 'Banner updated' : 'Banner added');
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
          <div className="erp-actions">
            <button className="erp-btn primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : editBannerId ? 'Update banner' : 'Add banner'}
            </button>
            {editBannerId ? (
              <button
                className="erp-btn ghost"
                type="button"
                onClick={() => {
                  setEditBannerId(null);
                  setBanner(emptyBanner);
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
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
                <td>
                  <strong>{b.title}</strong>
                  {b.subtitle ? <div className="muted">{b.subtitle}</div> : null}
                </td>
                <td>{b.link}</td>
                <td>
                  <span className={`erp-pill ${b.isActive ? 'ok' : 'off'}`}>{b.isActive ? 'Live' : 'Hidden'}</span>
                </td>
                <td>
                  <div className="erp-actions">
                    <button
                      type="button"
                      className="erp-btn ghost"
                      onClick={() => {
                        setEditBannerId(b.id);
                        setBanner({
                          title: b.title || '',
                          subtitle: b.subtitle || '',
                          link: b.link || '/shop',
                          imageUrl: b.imageUrl || '',
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="erp-btn ghost"
                      disabled={busy}
                      onClick={() => run(() => api.patch(`/admin/banners/${b.id}`, { isActive: !b.isActive }), 'Banner status saved')}
                    >
                      {b.isActive ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      className="erp-btn danger"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Delete banner "${b.title}"?`)) {
                          run(() => api.delete(`/admin/banners/${b.id}`), 'Banner deleted');
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
        <h2>{editCouponId ? 'Edit coupon' : 'New coupon'}</h2>
        <form
          className="erp-editor"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const payload = {
                ...coupon,
                expiresAt: coupon.expiresAt ? new Date(`${coupon.expiresAt}T23:59:59`).toISOString() : null,
              };
              if (editCouponId) {
                await api.patch(`/admin/coupons/${editCouponId}`, payload);
                setEditCouponId(null);
              } else {
                await api.post('/admin/coupons', payload);
              }
              setCoupon(emptyCoupon);
            }, editCouponId ? 'Coupon updated' : 'Coupon saved');
          }}
        >
          <label>
            Code
            <input required value={coupon.code} onChange={(e) => setCoupon({ ...coupon, code: e.target.value })} />
          </label>
          <label>
            Description
            <input value={coupon.description} onChange={(e) => setCoupon({ ...coupon, description: e.target.value })} />
          </label>
          <label>
            % off
            <input
              type="number"
              min="0"
              max="100"
              value={coupon.percentOff}
              onChange={(e) => setCoupon({ ...coupon, percentOff: e.target.value, amountOff: e.target.value ? '' : coupon.amountOff })}
            />
          </label>
          <label>
            ₹ off
            <input
              type="number"
              min="0"
              value={coupon.amountOff}
              onChange={(e) => setCoupon({ ...coupon, amountOff: e.target.value, percentOff: e.target.value ? '' : coupon.percentOff })}
            />
          </label>
          <label>
            Min order
            <input type="number" min="0" value={coupon.minOrder} onChange={(e) => setCoupon({ ...coupon, minOrder: e.target.value })} />
          </label>
          <label>
            Expires
            <input type="date" value={coupon.expiresAt} onChange={(e) => setCoupon({ ...coupon, expiresAt: e.target.value })} />
          </label>
          <label>
            Total uses (blank = unlimited)
            <input type="number" min="1" value={coupon.usageLimit} onChange={(e) => setCoupon({ ...coupon, usageLimit: e.target.value })} />
          </label>
          <label>
            Uses per customer (blank = unlimited)
            <input type="number" min="1" value={coupon.perCustomerLimit} onChange={(e) => setCoupon({ ...coupon, perCustomerLimit: e.target.value })} />
          </label>
          <div className="erp-actions">
            <button className="erp-btn primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : editCouponId ? 'Update coupon' : 'Save coupon'}
            </button>
            {editCouponId ? (
              <button
                className="erp-btn ghost"
                type="button"
                onClick={() => {
                  setEditCouponId(null);
                  setCoupon(emptyCoupon);
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Discount</th>
              <th>Min</th>
              <th>Expires</th>
              <th>Used</th>
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
                <td>{c.used || 0}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                <td>
                  <span className={`erp-pill ${c.active ? 'ok' : 'off'}`}>{c.active ? 'Active' : 'Off'}</span>
                </td>
                <td>
                  <div className="erp-actions">
                    <button
                      type="button"
                      className="erp-btn ghost"
                      onClick={() => {
                        setEditCouponId(c.id);
                        setCoupon({
                          code: c.code || '',
                          description: c.description || '',
                          percentOff: c.percentOff ? String(c.percentOff) : '',
                          amountOff: !c.percentOff && c.amountOff ? String(c.amountOff) : '',
                          minOrder: String(c.minOrder || 0),
                          expiresAt: c.expiresAt ? String(c.expiresAt).slice(0, 10) : '',
                          usageLimit: c.usageLimit ? String(c.usageLimit) : '',
                          perCustomerLimit: c.perCustomerLimit ? String(c.perCustomerLimit) : '',
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="erp-btn ghost"
                      disabled={busy}
                      onClick={() => run(() => api.patch(`/admin/coupons/${c.id}`, { active: !c.active }), 'Coupon status saved')}
                    >
                      {c.active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      className="erp-btn danger"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Delete coupon ${c.code}?`)) {
                          run(() => api.delete(`/admin/coupons/${c.id}`), 'Coupon deleted');
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
    </div>
  );
}
