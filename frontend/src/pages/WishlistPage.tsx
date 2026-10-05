import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import ProductCard from '../components/ProductCard';
import { EmptyState, LoadingState } from '../components/States';

export default function WishlistPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let alive = true;
    setLoading(true);
    api
      .get('/wishlist')
      .then(({ data }) => {
        if (!alive) return;
        setBooks(data.books || data.items || data || []);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.response?.data?.message || 'Failed to load wishlist');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  async function remove(bookId) {
    try {
      await api.delete(`/wishlist/${bookId}`);
      setBooks((list) => list.filter((b) => b.id !== bookId && b.book_id !== bookId));
    } catch {
      /* ignore */
    }
  }

  if (authLoading) return <LoadingState />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="wishlist-page container">
      <h1>Wishlist</h1>
      {loading ? (
        <LoadingState label="Loading wishlist…" />
      ) : error ? (
        <EmptyState title="Could not load wishlist" message={error} />
      ) : !books.length ? (
        <EmptyState
          title="Wishlist is empty"
          message="Save books you love for later."
          action={<Link to="/shop">Browse books</Link>}
        />
      ) : (
        <div className="product-grid">
          {books.map((book) => (
            <div key={book.id || book.book_id} className="wishlist-item">
              <ProductCard book={book.book || book} />
              <button type="button" className="text-btn danger" onClick={() => remove(book.id || book.book_id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
