import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { bookImage } from '../utils/format';

const empty = {
  title: '',
  authorName: '',
  isbn13: '',
  isbn10: '',
  publisher: 'Salem Book House',
  language: 'English',
  binding: 'Paper Back',
  edition: '',
  publishingDate: '',
  productType: 'book',
  mrp: '',
  salePrice: '',
  stock: '10',
  description: '',
  imageUrl: '',
  isActive: true,
  isFeatured: false,
  isBestseller: false,
  categoryIds: [],
};

export default function AdminProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/admin/categories')
      .then(({ data }) => setCategories(data.categories || []))
      .catch((err) => setError(err.message));
    if (!id) return;
    api
      .get(`/admin/books/${id}`)
      .then(({ data }) => {
        const b = data.book;
        setForm({
          title: b.title || '',
          authorName: b.authorName || '',
          isbn13: b.isbn13 || b.sku || '',
          isbn10: b.isbn10 || '',
          publisher: b.publisher || '',
          language: b.language || 'English',
          binding: b.binding || 'Paper Back',
          edition: b.edition || '',
          publishingDate: b.publishingDate || '',
          productType: b.productType || 'book',
          mrp: String(b.mrp ?? ''),
          salePrice: String(b.salePrice ?? ''),
          stock: String(b.stock ?? 0),
          description: b.description || '',
          imageUrl: b.imageUrl || '',
          isActive: b.isActive !== false,
          isFeatured: Boolean(b.isFeatured),
          isBestseller: Boolean(b.isBestseller),
          categoryIds: (b.categories || []).map((c) => c.id).filter(Boolean),
        });
      })
      .catch((err) => setError(err.message));
  }, [id]);

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCat(catId) {
    setForm((prev) => {
      const has = prev.categoryIds.includes(catId);
      return {
        ...prev,
        categoryIds: has ? prev.categoryIds.filter((x) => x !== catId) : [...prev.categoryIds, catId],
      };
    });
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setError('');
    try {
      const { data } = await api.post('/admin/upload', fd);
      set('imageUrl', data.url);
    } catch (err) {
      setError(`Image upload failed: ${err.message}`);
    } finally {
      e.target.value = '';
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (form.salePrice !== '' && Number(form.salePrice) > Number(form.mrp)) {
      setError('Sale price cannot be higher than MRP');
      return;
    }
    setBusy(true);
    setError('');
    const payload = {
      ...form,
      mrp: Number(form.mrp),
      salePrice: Number(form.salePrice || form.mrp),
      stock: Number(form.stock),
      sku: form.isbn13,
    };
    try {
      if (id) await api.patch(`/admin/books/${id}`, payload);
      else await api.post('/admin/books', payload);
      navigate('/admin/products');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="erp-form" onSubmit={onSubmit}>
      <div className="stack erp-card" style={{ padding: '1rem' }}>
        {error ? <p className="erp-error">{error}</p> : null}
        <label>
          Product name
          <input required value={form.title} onChange={(e) => set('title', e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            SKU / ISBN-13 (barcode)
            <input value={form.isbn13} onChange={(e) => set('isbn13', e.target.value)} />
          </label>
          <label>
            ISBN-10
            <input value={form.isbn10} onChange={(e) => set('isbn10', e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Author / brand
            <input required value={form.authorName} onChange={(e) => set('authorName', e.target.value)} />
          </label>
          <label>
            Publisher
            <input value={form.publisher} onChange={(e) => set('publisher', e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Type
            <select value={form.productType} onChange={(e) => set('productType', e.target.value)}>
              <option value="book">Book</option>
              <option value="stationery">Stationery</option>
              <option value="toy">Toy</option>
              <option value="gift-card">Gift card</option>
            </select>
          </label>
          <label>
            Language
            <input value={form.language} onChange={(e) => set('language', e.target.value)} />
          </label>
          <label>
            Binding
            <input value={form.binding} onChange={(e) => set('binding', e.target.value)} />
          </label>
        </div>
        <label>
          Description
          <textarea rows={6} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </label>
        <div>
          <span className="muted">Categories</span>
          <div className="erp-cats">
            {categories.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={form.categoryIds.includes(c.id)}
                  onChange={() => toggleCat(c.id)}
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="stack erp-card" style={{ padding: '1rem' }}>
        {form.imageUrl ? <img className="erp-thumb" style={{ width: 120, height: 160 }} src={bookImage({ imageUrl: form.imageUrl })} alt="" /> : null}
        <label>
          Cover image URL
          <input value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} />
        </label>
        <label>
          Upload image
          <input type="file" accept="image/*" onChange={onUpload} />
        </label>
        <div className="form-row">
          <label>
            MRP
            <input required type="number" min="0" value={form.mrp} onChange={(e) => set('mrp', e.target.value)} />
          </label>
          <label>
            Sale price
            <input type="number" min="0" value={form.salePrice} onChange={(e) => set('salePrice', e.target.value)} />
          </label>
          <label>
            Stock
            <input type="number" min="0" value={form.stock} onChange={(e) => set('stock', e.target.value)} />
          </label>
        </div>
        <div className="erp-checks">
          <label>
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Active
          </label>
          <label>
            <input type="checkbox" checked={form.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} /> Featured
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.isBestseller}
              onChange={(e) => set('isBestseller', e.target.checked)}
            />{' '}
            Bestseller
          </label>
        </div>
        <button className="erp-btn primary" disabled={busy} type="submit">
          {busy ? 'Saving…' : id ? 'Update product' : 'Create product'}
        </button>
        <button className="erp-btn ghost" type="button" onClick={() => navigate('/admin/products')}>
          Cancel
        </button>
      </div>
    </form>
  );
}
