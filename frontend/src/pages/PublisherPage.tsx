import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import ProductCard from '../components/ProductCard';
import { LoadingState, EmptyState } from '../components/States';

export default function PublisherPage() {
  const { slug } = useParams();
  const [publisher, setPublisher] = useState(null);
  const [books, setBooks] = useState([]);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slug) {
      api
        .get(`/publishers/${slug}`)
        .then(({ data }) => {
          setPublisher(data.publisher);
          setBooks(data.books || []);
        })
        .catch(() => setPublisher(null))
        .finally(() => setLoading(false));
    } else {
      api
        .get('/publishers')
        .then(({ data }) => setList(data.publishers || []))
        .finally(() => setLoading(false));
    }
  }, [slug]);

  if (loading) return <LoadingState />;

  if (!slug) {
    return (
      <div className="container cms-page">
        <h1>Publishers</h1>
        <p className="muted">Browse titles by publisher from our Salem Book House catalogue.</p>
        {!list.length ? (
          <EmptyState
            title="Publishers coming soon"
            message="Meanwhile explore Books, School & Board, or Competitive Exams from the shop."
          />
        ) : (
          <ul className="plain-list">
            {list.map((p) => (
              <li key={p.slug}>
                <Link to={`/publishers/${p.slug}`}>
                  {p.name} ({p.bookCount})
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p style={{ marginTop: '1rem' }}>
          <Link to="/shop">Browse all products →</Link>
        </p>
      </div>
    );
  }

  if (!publisher) return <EmptyState title="Publisher not found" />;

  return (
    <div className="container author-page">
      <h1>{publisher.name}</h1>
      <div className="product-grid">
        {books.map((book) => (
          <ProductCard key={book.id} book={book} />
        ))}
      </div>
    </div>
  );
}
