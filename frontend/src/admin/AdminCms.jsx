import { useEffect, useState } from 'react';
import api from '../api/client';

export default function AdminCms() {
  const [pages, setPages] = useState([]);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  function load() {
    api
      .get('/admin/pages')
      .then(({ data }) => setPages(data.pages || []))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error ? <p className="erp-error">{error}</p> : null}
      {pages.map((p) => {
        const cur = edit?.slug === p.slug ? edit : p;
        return (
          <form
            key={p.slug}
            className="erp-card"
            style={{ padding: '1rem' }}
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              setSaved('');
              try {
                await api.put(`/admin/pages/${p.slug}`, { title: cur.title, body: cur.body });
                setEdit(null);
                setSaved(p.slug);
                load();
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            <h2>/{p.slug}</h2>
            <label>
              Title
              <input required value={cur.title} onChange={(e) => setEdit({ ...cur, title: e.target.value })} />
            </label>
            <label>
              Body
              <textarea
                required
                rows={6}
                value={cur.body}
                onChange={(e) => setEdit({ ...cur, body: e.target.value })}
              />
            </label>
            <button className="erp-btn primary" type="submit" style={{ marginTop: '0.75rem' }}>
              Save page
            </button>
            {saved === p.slug ? <span className="erp-ok"> Saved — live on the storefront.</span> : null}
          </form>
        );
      })}
    </div>
  );
}
