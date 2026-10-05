import { useEffect, useState } from 'react';
import api from '../api/client';
import HeroBanner from '../components/HeroBanner';
import TopCharts from '../components/TopCharts';
import ProductCarousel from '../components/ProductCarousel';
import ExamGrid from '../components/ExamGrid';
import FeaturedAuthors from '../components/FeaturedAuthors';
import { EmptyState, LoadingState } from '../components/States';

export default function HomePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get('/home')
      .then(({ data: payload }) => {
        if (alive) setData(payload);
      })
      .catch((err) => {
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
      <ExamGrid exams={exams} />
      <FeaturedAuthors authors={authors} />
    </div>
  );
}
