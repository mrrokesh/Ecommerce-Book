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
  images: [] as string[],
  isActive: true,
  isFeatured: false,
  isBestseller: false,
  codAllowed: true,
  categoryIds: [],
};

function galleryFromBook(b: { images?: string[]; imageUrl?: string }) {
  const list = Array.isArray(b.images) ? b.images.filter(Boolean) : [];
  if (list.length) return list;
  return b.imageUrl ? [b.imageUrl] : [];
}

export default function AdminProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [categories, setCategories] = useState([]);
  const [pasteUrl, setPasteUrl] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [provenance, setProvenance] = useState(null);

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
        const images = galleryFromBook(b);
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
          imageUrl: images[0] || b.imageUrl || '',
          images,
          isActive: b.isActive !== false,
          isFeatured: Boolean(b.isFeatured),
          isBestseller: Boolean(b.isBestseller),
          codAllowed: b.codAllowed !== false,
          categoryIds: (b.categories || []).map((c) => c.id).filter(Boolean),
        });
        setProvenance({
          source: b.source || (b.erpId ? 'erp' : 'manual'),
          sourceLabel: b.sourceLabel || '',
          createdByName: b.createdByName || '',
          updatedByName: b.updatedByName || '',
          createdAt: b.createdAt || null,
          updatedAt: b.updatedAt || null,
          erpId: b.erpId || '',
        });
      })
      .catch((err) => setError(err.message));
  }, [id]);

  function formatWhen(v) {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleString('en-IN');
    } catch {
      return String(v);
    }
  }

  function sourcePill(source) {
    if (source === 'erp') return { label: 'Rokesh ERP', className: 'info' };
    if (source === 'admin') return { label: 'Added by admin', className: 'ok' };
    if (source === 'staff') return { label: 'Added by staff', className: 'warn' };
    return { label: 'Manual', className: 'off' };
  }

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setImages(next: string[]) {
    const cleaned = next.filter(Boolean);
    setForm((prev) => ({ ...prev, images: cleaned, imageUrl: cleaned[0] || '' }));
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

  function removeImage(url: string) {
    setImages(form.images.filter((u) => u !== url));
  }

  function setAsCover(url: string) {
    setImages([url, ...form.images.filter((u) => u !== url)]);
  }

  function addUrl(url: string) {
    const u = String(url || '').trim();
    if (!u) return;
    if (form.images.includes(u)) {
      setError('That image is already in the gallery');
      return;
    }
    setImages([...form.images, u]);
    setPasteUrl('');
    setError('');
  }

  async function uploadFiles(files: File[]) {
    const list = files.filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setError('');
    setUploading(true);
    const added: string[] = [];
    try {
      for (const file of list) {
        if (file.size > 3 * 1024 * 1024) {
          setError(`${file.name} is over 3MB`);
          continue;
        }
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await api.post('/admin/upload', fd);
        if (data?.url) added.push(data.url);
      }
      if (added.length) {
        setForm((prev) => {
          const next = [...prev.images, ...added.filter((u) => !prev.images.includes(u))];
          return { ...prev, images: next, imageUrl: next[0] || '' };
        });
      }
    } catch (err) {
      setError(`Image upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  async function onUpload(e) {
    const files = Array.from(e.target.files || []) as File[];
    await uploadFiles(files);
    e.target.value = '';
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (form.salePrice !== '' && Number(form.salePrice) > Number(form.mrp)) {
      setError('Sale price cannot be higher than MRP');
      return;
    }
    setBusy(true);
    setError('');
    const images = form.images.length ? form.images : form.imageUrl ? [form.imageUrl] : [];
    const payload = {
      ...form,
      images,
      imageUrl: images[0] || '',
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
        {id && provenance ? (
          <div className="erp-provenance">
            <div className="erp-provenance-head">
              <span className={`erp-pill ${sourcePill(provenance.source).className}`}>
                {sourcePill(provenance.source).label}
              </span>
              {provenance.erpId ? <span className="muted">ERP id {provenance.erpId}</span> : null}
            </div>
            <dl className="erp-provenance-grid">
              <div>
                <dt>Added by</dt>
                <dd>{provenance.createdByName || (provenance.source === 'erp' ? 'Rokesh ERP sync' : '—')}</dd>
              </div>
              <div>
                <dt>Added on</dt>
                <dd>{formatWhen(provenance.createdAt)}</dd>
              </div>
              <div>
                <dt>Last edited by</dt>
                <dd>{provenance.updatedByName || '—'}</dd>
              </div>
              <div>
                <dt>Last edited</dt>
                <dd>{formatWhen(provenance.updatedAt)}</dd>
              </div>
              {provenance.sourceLabel ? (
                <div className="erp-provenance-wide">
                  <dt>Source</dt>
                  <dd>{provenance.sourceLabel}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
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
            <input pattern="[0-9]{9}[0-9Xx]" title="An ISBN-10 has 10 characters: nine digits and a digit or X" value={form.isbn10} onChange={(e) => set('isbn10', e.target.value)} />
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
        <div className="erp-gallery-block">
          <h3 className="erp-gallery-title">Images</h3>
          <p className="muted erp-gallery-hint">Primary image is the cover on the shop. Extra images appear in the product gallery.</p>
          <div className="erp-gallery-toolbar">
            <label className="erp-btn primary erp-gallery-file-btn">
              Upload Image
              <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple onChange={onUpload} disabled={uploading} hidden />
            </label>
            <button type="button" className="erp-btn" onClick={() => setShowUrl((v) => !v)}>
              Add by URL
            </button>
          </div>
          {showUrl ? (
            <div className="erp-gallery-url">
              <input
                data-validate="link"
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
                placeholder="https://… or /uploads/media/…"
                aria-label="Paste image URL"
              />
              <button type="button" className="erp-btn primary" disabled={!pasteUrl.trim()} onClick={() => addUrl(pasteUrl)}>
                Add
              </button>
            </div>
          ) : null}
          <label
            className={`erp-gallery-drop${dragOver ? ' is-over' : ''}${uploading ? ' is-busy' : ''}`}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void uploadFiles(Array.from(e.dataTransfer.files || []));
            }}
          >
            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple onChange={onUpload} disabled={uploading} hidden />
            <span className="erp-gallery-drop-icon" aria-hidden>
              ↑
            </span>
            <strong>{uploading ? 'Uploading…' : 'Drag & drop images or click to select'}</strong>
            <small>Supported formats: JPG, PNG, GIF, WebP (max 3MB)</small>
          </label>
          <div className="erp-gallery-added">
            <span className="erp-gallery-added-label">Added Images</span>
            {form.images.length ? (
              <div className="erp-gallery">
                {form.images.map((url, i) => (
                  <div key={url} className={`erp-gallery-item${i === 0 ? ' is-cover' : ''}`}>
                    <img src={bookImage({ imageUrl: url })} alt="" />
                    {i === 0 ? <span className="erp-gallery-badge">Primary</span> : null}
                    <div className="erp-gallery-overlay">
                      {i !== 0 ? (
                        <button type="button" className="erp-gallery-primary-btn" onClick={() => setAsCover(url)}>
                          Primary
                        </button>
                      ) : (
                        <span className="erp-gallery-primary-btn is-active">Primary</span>
                      )}
                      <button type="button" className="erp-gallery-del" aria-label="Remove image" onClick={() => removeImage(url)}>
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No images yet.
              </p>
            )}
          </div>
        </div>
        <div className="form-row">
          <label>
            MRP
            <input required type="number" min="0" value={form.mrp} onChange={(e) => set('mrp', e.target.value)} />
          </label>
          <label>
            Sale price
            <input type="number" min="0" max={form.mrp || undefined} step="any" value={form.salePrice} onChange={(e) => set('salePrice', e.target.value)} />
          </label>
          <label>
            Stock
            <input type="number" min="0" step="1" value={form.stock} onChange={(e) => set('stock', e.target.value)} />
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
          <label title="Untick for products that must be paid for online, such as fragile, high-value or made-to-order items">
            <input type="checkbox" checked={form.codAllowed} onChange={(e) => set('codAllowed', e.target.checked)} /> Cash on delivery available
          </label>
        </div>
        <button className="erp-btn primary" disabled={busy || uploading} type="submit">
          {busy ? 'Saving…' : id ? 'Update product' : 'Create product'}
        </button>
        <button className="erp-btn ghost" type="button" onClick={() => navigate('/admin/products')}>
          Cancel
        </button>
      </div>
    </form>
  );
}
