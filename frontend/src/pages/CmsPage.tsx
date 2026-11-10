import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api/client';
import { LoadingState, EmptyState } from '../components/States';

type CmsDoc = { title?: string; body?: string; slug?: string };

function resolvePage(payload: unknown): CmsDoc | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const fromData =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>).page
      : undefined;
  const nested = (root.page || fromData || root) as CmsDoc;
  if (!nested || typeof nested !== 'object') return null;
  if (!nested.title && !nested.body) return null;
  return nested;
}

function renderLine(line: string): ReactNode {
  const urlMatch = line.match(/^(.*?)(https?:\/\/\S+)(.*)$/);
  if (urlMatch) {
    return (
      <>
        {urlMatch[1]}
        <a href={urlMatch[2]} target="_blank" rel="noreferrer">
          {urlMatch[2]}
        </a>
        {urlMatch[3]}
      </>
    );
  }
  const mailMatch = line.match(/^(.*?)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(.*)$/);
  if (mailMatch) {
    return (
      <>
        {mailMatch[1]}
        <a href={`mailto:${mailMatch[2]}`}>{mailMatch[2]}</a>
        {mailMatch[3]}
      </>
    );
  }
  return line;
}

export default function CmsPage() {
  const { pathname } = useLocation();
  const slug = pathname.replace(/^\//, '').split('?')[0] || 'about';
  const [page, setPage] = useState<CmsDoc | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    (async () => {
      try {
        const { data } = await api.get(`/pages/${encodeURIComponent(slug)}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const resolved = resolvePage(data);
        if (!resolved?.title) {
          setPage(null);
          setError('Page content missing');
        } else {
          setPage(resolved);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setPage(null);
        setError(err instanceof Error ? err.message : 'Failed to load page');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [slug]);

  if (loading && !page) return <LoadingState />;
  if (!page) return <EmptyState title="Page not found" message={error} />;

  const blocks = String(page.body || '').split(/\n\n+/);

  return (
    <article className="cms-page container">
      <h1>{page.title}</h1>
      {blocks.map((block, i) => (
        <p key={i}>
          {block.split('\n').map((line, j, arr) => (
            <span key={j}>
              {renderLine(line)}
              {j < arr.length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      ))}
    </article>
  );
}
