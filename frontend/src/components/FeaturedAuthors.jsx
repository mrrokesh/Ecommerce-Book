import { Link } from 'react-router-dom';

export default function FeaturedAuthors({ authors = [], loading = false }) {
  if (loading) {
    return (
      <section className="featured-authors">
        <div className="container">
          <h2 className="section-title">Featured Authors</h2>
          <p className="state-msg">Loading authors…</p>
        </div>
      </section>
    );
  }

  if (!authors.length) return null;

  return (
    <section className="featured-authors">
      <div className="container">
        <div className="carousel-head">
          <h2 className="section-title">Featured Authors</h2>
          <Link to="/shop" className="view-all">
            View All
          </Link>
        </div>
        <div className="authors-row">
          {authors.map((author) => (
            <Link
              key={author.id || author.name}
              to={author.id ? `/authors/${author.id}` : `/search?q=${encodeURIComponent(author.name)}`}
              className="author-card"
            >
              <span className="author-avatar">{(author.name || '?').slice(0, 1)}</span>
              <span className="author-name">{author.name}</span>
              {author.bio ? <span className="author-bio">{author.bio}</span> : null}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
