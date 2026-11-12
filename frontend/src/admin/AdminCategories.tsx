import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { confirmAction } from '../components/Dialogs';
import api from '../api/client';

type Cat = {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  badge: string | null;
  sort_order: number;
  is_visible: boolean;
  product_count: number;
};

type Draft = {
  name: string;
  slug: string;
  parentId: string;
  badge: string;
  sortOrder: string;
  isVisible: boolean;
};

const EMPTY: Draft = { name: '', slug: '', parentId: '', badge: '', sortOrder: '', isVisible: true };

function toDraft(c: Cat): Draft {
  return {
    name: c.name,
    slug: c.slug,
    parentId: c.parent_id ? String(c.parent_id) : '',
    badge: c.badge || '',
    sortOrder: String(c.sort_order),
    isVisible: c.is_visible,
  };
}

function toBody(d: Draft) {
  return {
    name: d.name,
    slug: d.slug,
    parentId: d.parentId ? Number(d.parentId) : null,
    badge: d.badge,
    isVisible: d.isVisible,
    ...(d.sortOrder.trim() ? { sortOrder: Number(d.sortOrder) } : {}),
  };
}

export default function AdminCategories() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState<Draft>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  function load() {
    return api
      .get('/admin/categories')
      .then(({ data }) => setCats(data.categories || []))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  const tops = useMemo(() => cats.filter((c) => !c.parent_id), [cats]);
  const kidsOf = useMemo(() => {
    const m = new Map<number, Cat[]>();
    for (const c of cats) {
      if (!c.parent_id) continue;
      if (!m.has(c.parent_id)) m.set(c.parent_id, []);
      m.get(c.parent_id)!.push(c);
    }
    return m;
  }, [cats]);

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await load();
      setNotice(ok);
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const done = await run(() => api.post('/admin/categories', toBody(adding)), `Added "${adding.name}".`);
    if (done) setAdding(EMPTY);
  }

  async function onSave(c: Cat) {
    const done = await run(() => api.patch(`/admin/categories/${c.id}`, toBody(edit)), `Saved "${edit.name}".`);
    if (done) setEditId(null);
  }

  function onToggle(c: Cat) {
    run(
      () => api.patch(`/admin/categories/${c.id}`, { isVisible: !c.is_visible }),
      `"${c.name}" is now ${c.is_visible ? 'hidden from' : 'shown on'} the storefront.`
    );
  }

  async function onDelete(c: Cat) {
    if (!(await confirmAction(`Delete category "${c.name}"?`))) return;
    run(() => api.delete(`/admin/categories/${c.id}`), `Deleted "${c.name}".`);
  }

  function parentOptions(selfId: number | null) {
    return tops.filter((t) => t.id !== selfId);
  }

  function renderRow(c: Cat, isChild: boolean, parentHidden: boolean) {
    if (editId === c.id) {
      return (
        <tr key={c.id}>
          <td>
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </td>
          <td>
            <input data-validate="slug" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} />
          </td>
          <td>
            <select value={edit.parentId} onChange={(e) => setEdit({ ...edit, parentId: e.target.value })}>
              <option value="">— Top level —</option>
              {parentOptions(c.id).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </td>
          <td>
            <input
              value={edit.badge}
              maxLength={20}
              style={{ width: 70 }}
              onChange={(e) => setEdit({ ...edit, badge: e.target.value })}
            />
          </td>
          <td>
            <input
              type="number"
              value={edit.sortOrder}
              style={{ width: 70 }}
              onChange={(e) => setEdit({ ...edit, sortOrder: e.target.value })}
            />
          </td>
          <td>{c.product_count}</td>
          <td>
            <input
              type="checkbox"
              checked={edit.isVisible}
              onChange={(e) => setEdit({ ...edit, isVisible: e.target.checked })}
            />
          </td>
          <td>
            <div className="erp-actions">
              <button type="button" className="erp-btn primary" disabled={busy} onClick={() => onSave(c)}>
                Save
              </button>
              <button type="button" className="erp-btn ghost" onClick={() => setEditId(null)}>
                Cancel
              </button>
            </div>
          </td>
        </tr>
      );
    }
    return (
      <tr key={c.id}>
        <td style={isChild ? { paddingLeft: '2rem' } : { fontWeight: 600 }}>
          {isChild ? '↳ ' : ''}
          {c.name}
        </td>
        <td className="muted">{c.slug}</td>
        <td>{isChild ? cats.find((p) => p.id === c.parent_id)?.name : '—'}</td>
        <td>{c.badge ? <span className="erp-pill warn">{c.badge}</span> : null}</td>
        <td>{c.sort_order}</td>
        <td>{c.product_count}</td>
        <td>
          {c.is_visible && !parentHidden ? (
            <span className="erp-pill ok">shown</span>
          ) : (
            <span className="erp-pill off">{c.is_visible ? 'parent hidden' : 'hidden'}</span>
          )}
        </td>
        <td>
          <div className="erp-actions">
            <button
              type="button"
              className="erp-btn ghost"
              onClick={() => {
                setEditId(c.id);
                setEdit(toDraft(c));
              }}
            >
              Edit
            </button>
            <button type="button" className="erp-btn ghost" disabled={busy} onClick={() => onToggle(c)}>
              {c.is_visible ? 'Hide' : 'Show'}
            </button>
            <button type="button" className="erp-btn danger" disabled={busy} onClick={() => onDelete(c)}>
              Delete
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <div className="erp-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Add category</h3>
        <form className="erp-editor erp-form" onSubmit={onAdd}>
          <label>
            Name
            <input required value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
          </label>
          <label>
            Slug (optional)
            <input
              value={adding.slug}
              placeholder="auto from name"
              onChange={(e) => setAdding({ ...adding, slug: e.target.value })}
            />
          </label>
          <label>
            Parent
            <select value={adding.parentId} onChange={(e) => setAdding({ ...adding, parentId: e.target.value })}>
              <option value="">— Top level —</option>
              {tops.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Badge (optional)
            <input
              value={adding.badge}
              maxLength={20}
              placeholder="NEW"
              onChange={(e) => setAdding({ ...adding, badge: e.target.value })}
            />
          </label>
          <label>
            Sort order (optional)
            <input
              type="number"
              value={adding.sortOrder}
              placeholder="last"
              onChange={(e) => setAdding({ ...adding, sortOrder: e.target.value })}
            />
          </label>
          <div className="erp-actions">
            <button type="submit" className="erp-btn primary" disabled={busy}>
              Add category
            </button>
          </div>
        </form>
        <p className="muted" style={{ margin: 0 }}>
          The storefront menus, Browse Categories, shop filters and footer read these directly. The first 7
          shown top-level categories (lowest sort order first) appear in the header; the rest go under MORE.
        </p>
      </div>

      <div className="erp-card">
        {error ? <p className="erp-error" style={{ padding: '0.75rem 1rem 0' }}>{error}</p> : null}
        {notice ? <p className="erp-ok" style={{ padding: '0.75rem 1rem 0' }}>{notice}</p> : null}
        <table className="erp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Parent</th>
              <th>Badge</th>
              <th>Order</th>
              <th>Products</th>
              <th>Storefront</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tops.map((t) => (
              <Fragment key={t.id}>
                {renderRow(t, false, false)}
                {(kidsOf.get(t.id) || []).map((k) => renderRow(k, true, !t.is_visible))}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!cats.length ? <p className="muted" style={{ padding: '1rem' }}>No categories yet.</p> : null}
      </div>
    </>
  );
}
