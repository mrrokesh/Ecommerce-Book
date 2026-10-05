import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import ProductCard from '../components/ProductCard';
import { LoadingState, EmptyState } from '../components/States';

export default function AuthorPage() {
  const { id } = useParams();
  const [author, setAuthor] = useState(null);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .get(`/authors/${id}`)
      .then(({ data }) => {
        setAuthor(data.author);
        setBooks(data.books || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingState label="Loading author…" />;
  if (error || !author) {
    return <EmptyState title="Author not found" message={error} action={<Link to="/shop">Shop</Link>} />;
  }

  return (
    <div className="container author-page">
      <h1>{author.name}</h1>
      {author.bio ? <p className="muted">{author.bio}</p> : <p className="muted">Titles by {author.name} at Salem Book House.</p>}
      <div className="product-grid">
        {books.map((book) => (
          <ProductCard key={book.id} book={book} />
        ))}
      </div>
    </div>
  );
}
