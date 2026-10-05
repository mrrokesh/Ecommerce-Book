import { useEffect, useState } from 'react';
import api from '../api/client';
import { formatPrice } from '../utils/format';

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  function load() {
    setError('');
    api
      .get('/admin/customers', { params: { q } })
      .then(({ data }) => setCustomers(data.customers || []))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="erp-card">
      <form
        className="erp-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <input type="search" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="erp-btn ghost" type="submit">
          Search
        </button>
      </form>
      {error ? <p className="erp-error" style={{ padding: '0.75rem' }}>{error}</p> : null}
      <table className="erp-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Orders</th>
            <th>Spent</th>
            <th>Joined</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>
                {c.name} {c.role === 'admin' ? <span className="erp-pill off">admin</span> : null}
              </td>
              <td>{c.email}</td>
              <td>{c.phone || '—'}</td>
              <td>{c.orderCount}</td>
              <td>{formatPrice(c.spent)}</td>
              <td>{new Date(c.createdAt).toLocaleDateString('en-IN')}</td>
            </tr>
          ))}
          {!customers.length ? (
            <tr>
              <td colSpan={6} className="muted">
                No customers found.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
