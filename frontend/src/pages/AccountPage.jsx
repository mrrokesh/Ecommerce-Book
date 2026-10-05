import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/States';

export default function AccountPage() {
  const { user, loading, isAuthenticated, logout, refresh } = useAuth();
  const [profile, setProfile] = useState({ name: '', phone: '' });
  const [addresses, setAddresses] = useState([]);
  const [addr, setAddr] = useState({
    fullName: '',
    phone: '',
    line1: '',
    city: 'Salem',
    state: 'Tamil Nadu',
    pincode: '',
    isDefault: true,
  });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (user) setProfile({ name: user.name || '', phone: user.phone || '' });
  }, [user]);

  useEffect(() => {
    if (!isAuthenticated) return;
    api.get('/addresses').then(({ data }) => setAddresses(data.addresses || []));
  }, [isAuthenticated]);

  if (loading) return <LoadingState />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  async function saveProfile(e) {
    e.preventDefault();
    await api.patch('/auth/me', profile);
    await refresh();
    setMsg('Profile saved');
  }

  async function saveAddress(e) {
    e.preventDefault();
    const { data } = await api.post('/addresses', addr);
    setAddresses((list) => [data.address, ...list]);
    setMsg('Address saved');
  }

  async function removeAddress(id) {
    await api.delete(`/addresses/${id}`);
    setAddresses((list) => list.filter((a) => a.id !== id));
  }

  return (
    <div className="account-page container">
      <h1>My Account</h1>
      <div className="account-panel">
        <p>
          <strong>Email:</strong> {user.email}
        </p>
        <form className="checkout-form" onSubmit={saveProfile}>
          <label>
            Name
            <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </label>
          <label>
            Phone
            <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          </label>
          <button className="btn btn-navy" type="submit">
            Save profile
          </button>
        </form>
        {msg ? <p className="form-msg">{msg}</p> : null}
        <div className="account-links">
          <Link to="/account/orders" className="btn btn-navy">
            My Orders
          </Link>
          <Link to="/track" className="btn btn-outline">
            Track order
          </Link>
          <Link to="/wishlist" className="btn btn-outline">
            Wishlist
          </Link>
          {user.role === 'admin' ? (
            <Link to="/admin/products" className="btn btn-gold">
              Admin
            </Link>
          ) : null}
          <button type="button" className="btn btn-outline" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      <h2>Saved addresses</h2>
      <ul className="store-list">
        {addresses.map((a) => (
          <li key={a.id} className="store-card">
            <strong>
              {a.fullName}
              {a.isDefault ? ' (default)' : ''}
            </strong>
            <p>
              {a.line1}
              {a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.pincode}
            </p>
            <p>{a.phone}</p>
            <button type="button" className="text-btn" onClick={() => removeAddress(a.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form className="checkout-form" onSubmit={saveAddress}>
        <h3>Add address</h3>
        <label>
          Full name
          <input required value={addr.fullName} onChange={(e) => setAddr({ ...addr, fullName: e.target.value })} />
        </label>
        <label>
          Phone
          <input required value={addr.phone} onChange={(e) => setAddr({ ...addr, phone: e.target.value })} />
        </label>
        <label>
          Address
          <input required value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} />
        </label>
        <div className="form-row">
          <label>
            City
            <input value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
          </label>
          <label>
            Pincode
            <input required value={addr.pincode} onChange={(e) => setAddr({ ...addr, pincode: e.target.value })} />
          </label>
        </div>
        <button className="btn btn-gold" type="submit">
          Save address
        </button>
      </form>
    </div>
  );
}
