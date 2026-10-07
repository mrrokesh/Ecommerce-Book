import { Link } from 'react-router-dom';
import ProductCard from './ProductCard';

export default function AuthorOfDay({ author }: { author?: any }) {
  if (!author) return null;
  return (
    <section className="featured-authors author-of-day">
      <div className="container">
        <div className="carousel-head">
          <h2 className="section-title">Author of the day</h2>
          {author.id ? (
            <Link to={`/authors/${author.id}`} className="view-all">
              View all
            </Link>
          ) : null}
        </div>
        <div className="author-day-grid">
          <div className="author-card author-day-bio">
            <span className="author-avatar">{(author.name || '?').slice(0, 1)}</span>
            <span className="author-name">{author.name}</span>
            {author.bio ? <span className="author-bio">{author.bio}</span> : null}
          </div>
          <div className="product-grid compact">
            {(author.books || []).slice(0, 4).map((b: any) => (
              <ProductCard key={b.id || b.slug} book={b} compact />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
