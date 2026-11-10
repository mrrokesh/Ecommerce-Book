import { useEffect, useState, type ReactNode } from 'react';
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

  const blocks = String(page.body || '').split(/\n\n+/);

  return (
    <article className="cms-page container">
      <h1>{page.title}</h1>
      {blocks.map((block, i) => (
        <p key={i}>
          {block.split('\n').map((line, j, arr) => {
            const urlMatch = line.match(/^(.*?)(https?:\/\/\S+)(.*)$/);
            const mailMatch = line.match(/^(.*?)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(.*)$/);
            let content: ReactNode = line;
            if (urlMatch) {
              content = (
                <>
                  {urlMatch[1]}
                  <a href={urlMatch[2]} target="_blank" rel="noreferrer">
                    {urlMatch[2]}
                  </a>
                  {urlMatch[3]}
                </>
              );
            } else if (mailMatch) {
              content = (
                <>
                  {mailMatch[1]}
                  <a href={`mailto:${mailMatch[2]}`}>{mailMatch[2]}</a>
                  {mailMatch[3]}
                </>
              );
            }
            return (
              <span key={j}>
                {content}
                {j < arr.length - 1 ? <br /> : null}
              </span>
            );
          })}
        </p>
      ))}
    </article>
  );
}
