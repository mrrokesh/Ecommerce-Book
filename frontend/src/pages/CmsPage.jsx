import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api/client';
import { LoadingState, EmptyState } from '../components/States';

export default function CmsPage() {
  const { pathname } = useLocation();
  const slug = pathname.replace(/^\//, '');
  const [page, setPage] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/pages/${slug}`)
      .then(({ data }) => setPage(data.page || data))
      .catch((err) => {
        setPage(null);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <LoadingState />;
  if (!page) return <EmptyState title="Page not found" message={error} />;

  return (
    <article className="cms-page container">
      <h1>{page.title}</h1>
      {String(page.body || '')
        .split(/\n\n+/)
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </article>
  );
}
