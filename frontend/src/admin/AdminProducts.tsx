import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import CoverImage from '../components/CoverImage';
import { formatPrice } from '../utils/format';

export default function AdminProducts() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [q, setQ] = useState('');
  const [productType, setProductType] = useState('');
  const [stock, setStock] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [erp, setErp] = useState<{ configured: boolean; lastSync?: { at?: string; ok?: boolean; error?: string } }>({
    configured: false,
  });
  const [syncing, setSyncing] = useState(false);

  async function load(nextPage = page) {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.get('/admin/books', {
        params: { q, productType, stock, status, page: nextPage, pageSize: 20 },
      });
      setRows(data.books || []);
      setTotal(data.total || 0);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load(1);
    api.get('/admin/erp/status').then(({ data }) => setErp(data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productType, stock, status]);

  async function syncErp() {
    setSyncing(true);
    setError('');
    try {
      const { data } = await api.post('/admin/erp/sync');
      setNotice(`Synced ${data.upserted || 0} of ${data.fetched || 0} ERP products via ${data.tool || 'MCP'}.`);
      load(1);
      api.get('/admin/erp/status').then(({ data: s }) => setErp(s)).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function toggle(book) {
    setError('');
    try {
      await api.patch(`/admin/books/${book.id}`, { isActive: !book.isActive });
      load(page);
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(book) {
    if (!window.confirm(`Delete "${book.title}"? Products that have been ordered are hidden instead.`)) return;
    setError('');
    try {
      const { data } = await api.delete(`/admin/books/${book.id}`);
      setNotice(data.deleted ? `Deleted "${book.title}".` : `"${book.title}" has orders, so it was hidden instead.`);
      load(page);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="erp-card">
      <div className="erp-toolbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(1);
          }}
          className="erp-toolbar"
          style={{ padding: 0, border: 0, flex: 1 }}
        >
          <input
            type="search"
            placeholder="Search title, author, SKU / ISBN"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={productType} onChange={(e) => setProductType(e.target.value)}>
            <option value="">All types</option>
            <option value="book">Books</option>
            <option value="stationery">Stationery</option>
            <option value="toy">Toys</option>
            <option value="gift-card">Gift cards</option>
          </select>
          <select value={stock} onChange={(e) => setStock(e.target.value)}>
            <option value="">All stock</option>
            <option value="in">In stock</option>
            <option value="out">Out of stock</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Hidden</option>
          </select>
          <button className="erp-btn ghost" type="submit">
            Search
          </button>
        </form>
        <button
          className="erp-btn ghost"
          type="button"
          disabled={syncing || !erp.configured}
          onClick={syncErp}
          title={
            erp.lastSync
              ? `Last sync ${new Date(erp.lastSync.at).toLocaleString('en-IN')}: ${erp.lastSync.ok ? 'ok' : erp.lastSync.error}`
              : 'Not synced yet'
          }
        >
          {syncing ? 'Syncing ERP…' : erp.configured ? 'Sync from ERP' : 'ERP key missing'}
        </button>
        <Link className="erp-btn primary" to="/admin/products/new">
          Add product
        </Link>
      </div>
      {error ? <p className="erp-error" style={{ padding: '0 0.85rem' }}>{error}</p> : null}
      {notice ? <p className="erp-ok" style={{ padding: '0 0.85rem' }}>{notice}</p> : null}
      {erp.lastSync && !erp.lastSync.ok ? (
        <p className="erp-error" style={{ padding: '0 0.85rem' }}>Last ERP sync failed: {erp.lastSync.error}</p>
      ) : null}
      <table className="erp-table">
        <thead>
          <tr>
            <th />
            <th>SKU</th>
            <th>Product</th>
            <th>Type</th>
            <th>Category</th>
            <th>MRP</th>
            <th>Sale</th>
            <th>Stock</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td>
                <CoverImage className="erp-thumb" book={b} alt="" />
              </td>
              <td>{b.sku || b.isbn13 || `SBH-${b.id}`}</td>
              <td>
                <strong>{b.title}</strong>
                <div className="muted">{b.authorName}</div>
              </td>
              <td>{b.productType}</td>
              <td>{(b.categories || []).map((c) => c.name || c).join(', ') || '—'}</td>
              <td>{formatPrice(b.mrp)}</td>
              <td>{formatPrice(b.salePrice)}</td>
              <td>
                <span className={`erp-pill ${b.stock > 0 ? 'ok' : 'warn'}`}>{b.stock}</span>
              </td>
              <td>
                <span className={`erp-pill ${b.isActive !== false ? 'ok' : 'off'}`}>
                  {b.isActive !== false ? 'Active' : 'Hidden'}
                </span>
              </td>
              <td>
                <div className="erp-actions">
                  <Link className="erp-btn ghost" to={`/admin/products/${b.id}`}>
                    Edit
                  </Link>
                  <button type="button" className="erp-btn ghost" onClick={() => toggle(b)}>
                    {b.isActive ? 'Hide' : 'Show'}
                  </button>
                  <button type="button" className="erp-btn danger" onClick={() => remove(b)}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!rows.length && !busy ? (
            <tr>
              <td colSpan={10} className="muted">
                No products match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <div className="erp-pager">
        <span>
          {total} products · page {page} of {totalPages}
        </span>
        <div className="erp-actions">
          <button className="erp-btn ghost" type="button" disabled={page <= 1} onClick={() => load(page - 1)}>
            Previous
          </button>
          <button
            className="erp-btn ghost"
            type="button"
            disabled={page >= totalPages}
            onClick={() => load(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
