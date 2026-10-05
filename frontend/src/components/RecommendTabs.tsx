import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from './ProductCard';

export default function RecommendTabs({ similar = [], fromAuthor = [] }) {
  const [tab, setTab] = useState(similar.length ? 'similar' : 'author');
  const scroller = useRef(null);

  const books = useMemo(() => (tab === 'similar' ? similar : fromAuthor), [tab, similar, fromAuthor]);

  if (!similar.length && !fromAuthor.length) return null;

  function scrollBy(dir) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 560), behavior: 'smooth' });
  }

  return (
    <section className="recommend-section container">
      <div className="recommend-tabs">
        {similar.length ? (
          <button
            type="button"
            className={tab === 'similar' ? 'active' : ''}
            onClick={() => setTab('similar')}
          >
            Similar Books
          </button>
        ) : null}
        {fromAuthor.length ? (
          <button
            type="button"
            className={tab === 'author' ? 'active' : ''}
            onClick={() => setTab('author')}
          >
            From the Author
          </button>
        ) : null}
        <div className="recommend-nav">
          <button type="button" onClick={() => scrollBy(-1)} aria-label="Previous">
            ‹
          </button>
          <button type="button" onClick={() => scrollBy(1)} aria-label="Next">
            ›
          </button>
        </div>
      </div>
      <div className="recommend-track" ref={scroller}>
        {books.map((book) => (
          <div key={book.id} className="recommend-item">
            <ProductCard book={book} showAddToCart compact />
          </div>
        ))}
      </div>
      {!books.length ? (
        <p className="state-msg empty">
          No recommendations yet.{' '}
          <Link to="/shop">Browse all books</Link>
        </p>
      ) : null}
    </section>
  );
}
