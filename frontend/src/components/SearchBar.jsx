import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';

export default function SearchBar() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [categories, setCategories] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQ(params.get('q') || '');
  }, [params]);

  useEffect(() => {
    let alive = true;
    api
      .get('/categories')
      .then(({ data }) => {
        if (!alive) return;
        const list = data.categories || data || [];
        setCategories(Array.isArray(list) ? list.filter((c) => !c.parent_id && !c.parentId) : []);
      })
      .catch(() => {
        if (alive) setCategories([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  function onSubmit(e) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <div className="search-bar">
      <div className="container search-bar-inner">
        <div className="browse-wrap">
          <button type="button" className="browse-btn" onClick={() => setOpen((v) => !v)}>
            <span className="browse-icon">☰</span>
            BROWSE CATEGORIES
          </button>
          {open ? (
            <div className="browse-dropdown">
              {(categories.length
                ? categories
                : [
                    { name: 'Books', slug: 'books' },
                    { name: 'Kannada', slug: 'kannada' },
                    { name: 'Stationery', slug: 'stationery' },
                    { name: 'Toys', slug: 'toys' },
                    { name: 'Competitive Exams', slug: 'competitive-exams' },
                  ]
              ).map((cat) => (
                <Link
                  key={cat.slug}
                  to={`/shop/${cat.slug}`}
                  onClick={() => setOpen(false)}
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <form className="search-form" onSubmit={onSubmit}>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search books by title, author, ISBN"
            aria-label="Search books"
          />
          <Link to={`/search?q=${encodeURIComponent(q.trim() || '')}`} className="refine-link">
            Refine Search
          </Link>
          <button type="submit" className="search-submit" aria-label="Search">
            <SearchIcon />
          </button>
        </form>

        <p className="search-tagline">Your ultimate destination for books &amp; beyond.</p>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
