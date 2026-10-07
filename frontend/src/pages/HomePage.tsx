import { useEffect, useState } from 'react';
import api from '../api/client';
import HeroBanner from '../components/HeroBanner';
import TopCharts from '../components/TopCharts';
import ProductCarousel from '../components/ProductCarousel';
import ExamGrid from '../components/ExamGrid';
import FeaturedAuthors from '../components/FeaturedAuthors';
import AuthorOfDay from '../components/AuthorOfDay';
import { EmptyState, LoadingState } from '../components/States';

type HomePayload = {
  banners?: unknown[];
  sections?: { books?: unknown[]; categorySlug?: string; category_slug?: string; key?: string; id?: string; title?: string }[];
  homepageSections?: { books?: unknown[]; categorySlug?: string; category_slug?: string; key?: string; id?: string; title?: string }[];
  topCharts?: unknown[];
  authors?: unknown[];
  featuredAuthors?: unknown[];
  authorOfDay?: unknown;
  exams?: unknown[];
};

async function loadHome(attempts = 3) {
  let last: Error | null = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const { data } = await api.get('/home');
      return data as HomePayload;
    } catch (err) {
      last = err instanceof Error ? err : new Error('Failed to load homepage');
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      }
    }
  }
  throw last || new Error('Failed to load homepage');
}

export default function HomePage() {
  const [data, setData] = useState<HomePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadHome()
      .then((payload) => {
        if (alive) setData(payload);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message || 'Failed to load homepage');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <LoadingState label="Loading Salem Book House…" />;
  if (error && !data) {
    return (
      <EmptyState
        title="Unable to load homepage"
        message={error}
      />
    );
  }

  const banners = data?.banners || [];
  const sections = data?.sections || data?.homepageSections || [];
  const topCharts = data?.topCharts || [];
  const authors = data?.authors || data?.featuredAuthors || [];
  const authorOfDay = data?.authorOfDay;
  const exams = data?.exams || [];

  return (
    <div className="home-page">
      <HeroBanner banners={banners} />
      <TopCharts items={topCharts} />
      {sections.map((section) => {
        const books = section.books || [];
        const slug = section.categorySlug || section.category_slug || section.key;
        return (
          <ProductCarousel
            key={section.key || section.id || section.title}
            title={section.title}
            books={books}
            viewAllTo={slug ? `/shop/${slug}` : '/shop'}
          />
        );
      })}
      {!sections.length ? (
        <EmptyState title="No featured sections" message="Books will appear here once the catalog is seeded." />
      ) : null}
      <AuthorOfDay author={authorOfDay} />
      <ExamGrid exams={exams} />
      <FeaturedAuthors authors={authors} />
    </div>
  );
}
