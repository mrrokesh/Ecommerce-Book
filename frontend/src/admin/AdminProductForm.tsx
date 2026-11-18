import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { bookImage } from '../utils/format';
import { PRODUCT_TYPES } from './productTypes';

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
  const [pickParent, setPickParent] = useState('');
  const [pickChild, setPickChild] = useState('');

  const topCategories = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const childCategories = useMemo(
    () => (pickParent ? categories.filter((c) => String(c.parent_id) === String(pickParent)) : []),
    [categories, pickParent]
  );
  const categoryById = useMemo(() => {
    const m = new Map();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

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

  function addCategoryId(catId) {
    const idNum = Number(catId);
    if (!idNum) return;
    setForm((prev) => {
      if (prev.categoryIds.includes(idNum)) return prev;
      return { ...prev, categoryIds: [...prev.categoryIds, idNum] };
    });
  }

  function removeCategoryId(catId) {
    setForm((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.filter((x) => x !== catId),
    }));
  }

  function addPickedCategory() {
    const childId = Number(pickChild);
    const parentId = Number(pickParent);
    if (childId) addCategoryId(childId);
    else if (parentId) addCategoryId(parentId);
    setPickChild('');
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
    <form
      className="erp-form"
      onSubmit={onSubmit}
      autoComplete="off"
      data-lpignore="true"
      data-1p-ignore="true"
      data-bwignore="true"
      data-form-type="other"
    >
      <div className="stack erp-card" style={{ padding: '1rem' }}>
        {error ? <p className="erp-error">{error}</p> : null}
        <label>
          Product name
          <input
            required
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
          />
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
        <div className="form-row form-row-3">
          <label>
            Type
            <select value={form.productType} onChange={(e) => set('productType', e.target.value)}>
              {PRODUCT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
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
        <div className="erp-cat-picker">
          <span className="muted">Categories</span>
          <p className="muted erp-gallery-hint">
            Pick a category, then a subcategory (like Rokesh ERP). You can add more than one.
          </p>
          <div className="form-row erp-cat-cascade">
            <label>
              Category
              <select
                value={pickParent}
                onChange={(e) => {
                  setPickParent(e.target.value);
                  setPickChild('');
                }}
              >
                <option value="">Select category</option>
                {topCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subcategory
              <select
                value={pickChild}
                onChange={(e) => setPickChild(e.target.value)}
                disabled={!pickParent}
              >
                <option value="">{pickParent ? (childCategories.length ? 'Select subcategory' : 'No subcategories — use parent') : 'Choose a category first'}</option>
                {childCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="erp-cat-add-wrap">
              <button
                type="button"
                className="erp-btn"
                disabled={!pickParent}
                onClick={addPickedCategory}
              >
                Add category
              </button>
            </div>
          </div>
          {form.categoryIds.length ? (
            <div className="erp-cat-chips">
              {form.categoryIds.map((cid) => {
                const c = categoryById.get(cid);
                const parent = c?.parent_id ? categoryById.get(c.parent_id) : null;
                const label = c
                  ? parent
                    ? `${parent.name} → ${c.name}`
                    : c.name
                  : `Category #${cid}`;
                return (
                  <span key={cid} className="erp-cat-chip">
                    {label}
                    <button type="button" aria-label={`Remove ${label}`} onClick={() => removeCategoryId(cid)}>
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
              No categories assigned yet.
            </p>
          )}
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
                          Make primary
                        </button>
                      ) : null}
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
        <div className="erp-form-actions">
          <button className="erp-btn primary" disabled={busy || uploading} type="submit">
            {busy ? 'Saving…' : id ? 'Update product' : 'Create product'}
          </button>
          <button className="erp-btn ghost" type="button" onClick={() => navigate('/admin/products')}>
            Cancel
          </button>
        </div>
        {id && provenance ? (
          <div className="erp-provenance" style={{ marginTop: '1rem' }}>
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
      </div>
    </form>
  );
}
