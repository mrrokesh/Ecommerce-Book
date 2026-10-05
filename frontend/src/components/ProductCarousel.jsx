import { useRef } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from './ProductCard';

export default function ProductCarousel({
  title,
  books = [],
  viewAllTo,
  loading = false,
  emptyText = 'No books in this section yet.',
}) {
  const scroller = useRef(null);

  function scrollBy(dir) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 560), behavior: 'smooth' });
  }

  return (
    <section className="product-carousel">
      <div className="container">
        <div className="carousel-head">
          <h2 className="section-title">{title}</h2>
          <div className="carousel-actions">
            {viewAllTo ? (
              <Link to={viewAllTo} className="view-all">
                View All
              </Link>
            ) : null}
            <button type="button" className="carousel-nav" onClick={() => scrollBy(-1)} aria-label="Scroll left">
              ‹
            </button>
            <button type="button" className="carousel-nav" onClick={() => scrollBy(1)} aria-label="Scroll right">
              ›
            </button>
          </div>
        </div>

        {loading ? (
          <p className="state-msg">Loading books…</p>
        ) : !books.length ? (
          <p className="state-msg empty">{emptyText}</p>
        ) : (
          <div className="carousel-track" ref={scroller}>
            {books.map((book) => (
              <div key={book.id || book.slug} className="carousel-item">
                <ProductCard book={book} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
