import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import ProductCard from '../components/ProductCard';
import { EmptyState, LoadingState } from '../components/States';

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!q.trim()) {
      setBooks([]);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    setError('');
    api
      .get('/books', { params: { q: q.trim(), limit: 48 } })
      .then(({ data }) => {
        if (!alive) return;
        setBooks(data.books || data.items || data || []);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.response?.data?.message || 'Search failed');
        setBooks([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [q]);

  return (
    <div className="search-page container">
      <h1>Search results{q ? ` for “${q}”` : ''}</h1>
      {!q.trim() ? (
        <EmptyState title="Enter a search term" message="Search by title, author, or ISBN." />
      ) : loading ? (
        <LoadingState label="Searching…" />
      ) : error ? (
        <EmptyState title="Search error" message={error} />
      ) : !books.length ? (
        <EmptyState
          title="No matches"
          message="Try a different keyword."
          action={<Link to="/shop">Browse all books</Link>}
        />
      ) : (
        <>
          <p className="muted">{books.length} result{books.length === 1 ? '' : 's'}</p>
          <div className="product-grid">
            {books.map((book) => (
              <ProductCard key={book.id || book.slug} book={book} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
