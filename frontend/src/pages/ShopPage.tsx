import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { loadCategories } from '../api/cache';
import ProductCard from '../components/ProductCard';
import { EmptyState, LoadingState } from '../components/States';

const SORTS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'discount', label: 'Discount' },
];

export default function ShopPage() {
  const { categorySlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [books, setBooks] = useState([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const sort = searchParams.get('sort') || 'relevance';
  const language = searchParams.get('language') || '';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  const page = Number(searchParams.get('page') || 1);

  const title = useMemo(() => {
    if (!categorySlug) return 'All Books';
    return categorySlug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }, [categorySlug]);

  useEffect(() => {
    loadCategories()
      .then((data) => setCategories(data.categories || data.tree || []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const params: Record<string, string | number> = {
      page,
      limit: 24,
      sort,
    };
    if (categorySlug) params.category = categorySlug;
    if (language) params.language = language;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;
    if (searchParams.get('exam')) params.exam = searchParams.get('exam');

    api
      .get('/books', { params })
      .then(({ data }) => {
        if (!alive) return;
        setBooks(data.books || data.items || data || []);
        setTotal(data.pagination?.total ?? data.total ?? data.count ?? (data.books || []).length);
      })
      .catch((err) => {
        if (!alive) return;
        setBooks([]);
        setError(err.message || 'Failed to load books');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [categorySlug, sort, language, minPrice, maxPrice, page, searchParams]);

  function updateFilter(key, value) {
    const next = new URLSearchParams(searchParams);
    if (!value) next.delete(key);
    else next.set(key, value);
    next.delete('page');
    setSearchParams(next);
  }

  return (
    <div className="shop-page container">
      <aside className="shop-filters">
        <h2>Filters</h2>
        <label>
          Language
          <select value={language} onChange={(e) => updateFilter('language', e.target.value)}>
            <option value="">All</option>
            <option value="English">English</option>
            <option value="Kannada">Kannada</option>
            <option value="Tamil">Tamil</option>
            <option value="Hindi">Hindi</option>
          </select>
        </label>
        <label>
          Min Price
          <input
            type="number"
            min="0"
            value={minPrice}
            onChange={(e) => updateFilter('minPrice', e.target.value)}
            placeholder="0"
          />
        </label>
        <label>
          Max Price
          <input
            type="number"
            min="0"
            value={maxPrice}
            onChange={(e) => updateFilter('maxPrice', e.target.value)}
            placeholder="5000"
          />
        </label>
        <div className="filter-cats">
          <h3>Categories</h3>
          <Link to="/shop" className={!categorySlug ? 'active' : ''}>
            All
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              to={`/shop/${cat.slug}`}
              className={categorySlug === cat.slug ? 'active' : ''}
            >
              {cat.name}
            </Link>
          ))}
        </div>
      </aside>

      <section className="shop-results">
        <div className="shop-toolbar">
          <div>
            <h1>{title}</h1>
            <p className="muted">{loading ? 'Loading…' : `${total} books`}</p>
          </div>
          <label className="sort-label">
            Sort by
            <select value={sort} onChange={(e) => updateFilter('sort', e.target.value)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <LoadingState label="Loading books…" />
        ) : error ? (
          <EmptyState title="Could not load books" message={error} />
        ) : !books.length ? (
          <EmptyState title="No books found" message="Try another category or clear filters." />
        ) : (
          <div className="product-grid">
            {books.map((book) => (
              <ProductCard key={book.id || book.slug} book={book} />
            ))}
          </div>
        )}

        {total > 24 ? (
          <div className="pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => updateFilter('page', String(page - 1))}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              type="button"
              disabled={page * 24 >= total}
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set('page', String(page + 1));
                setSearchParams(next);
              }}
            >
              Next
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
