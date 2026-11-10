import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { loadCategories } from '../api/cache';
import type { CategoryNode } from '../types';
import ProductCard from '../components/ProductCard';
import { EmptyState, LoadingState } from '../components/States';

const SORTS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'discount', label: 'Discount' },
];

const SHOP_ROOT_ORDER = [
  'books',
  'school-board',
  'competitive-exams',
  'college',
  'stationery',
  'toys',
  'gifts',
  'accessories',
  'e-gift-card',
];

const HIDDEN = new Set([
  'pre-order',
  'new-arrivals',
  'best-sellers',
  'featured-author',
  'young-adult',
  'children',
  'kannada',
]);

const LANG_OPTIONS = ['Tamil', 'English', 'Hindi'];

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildTree(payload: { tree?: CategoryNode[]; categories?: CategoryNode[] }): CategoryNode[] {
  const fromTree = payload.tree?.length
    ? payload.tree
    : (() => {
        const flat = payload.categories || [];
        const byParent = new Map<number | string, CategoryNode[]>();
        for (const c of flat) {
          const key = c.parentId ?? c.parent_id ?? 0;
          if (!byParent.has(key)) byParent.set(key, []);
          byParent.get(key)!.push(c);
        }
        return (byParent.get(0) || []).map((r) => ({
          ...r,
          children: byParent.get(r.id as number) || [],
        }));
      })();

  return fromTree
    .filter((n) => n.slug && !HIDDEN.has(n.slug) && SHOP_ROOT_ORDER.includes(n.slug))
    .map((r) => ({
      ...r,
      children: (r.children || [])
        .filter((c) => c.slug && !HIDDEN.has(c.slug))
        .sort((a, b) => {
          if (a.slug === 'tamil') return -1;
          if (b.slug === 'tamil') return 1;
          return String(a.name || '').localeCompare(String(b.name || ''));
        }),
    }))
    .sort((a, b) => SHOP_ROOT_ORDER.indexOf(a.slug) - SHOP_ROOT_ORDER.indexOf(b.slug));
}

export default function ShopPage() {
  const { categorySlug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [books, setBooks] = useState([]);
  const [total, setTotal] = useState(0);
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sort = searchParams.get('sort') || 'relevance';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  const page = Number(searchParams.get('page') || 1);

  const selectedCats = useMemo(() => {
    const fromQuery = parseList(searchParams.get('cats'));
    if (fromQuery.length) return fromQuery;
    if (categorySlug) return [categorySlug];
    return [];
  }, [searchParams, categorySlug]);

  const selectedLangs = useMemo(() => parseList(searchParams.get('langs')), [searchParams]);

  const title = useMemo(() => {
    if (!selectedCats.length) return 'All Books';
    const flat = tree.flatMap((r) => [r, ...(r.children || [])]);
    const names = selectedCats
      .map((slug) => flat.find((c) => c.slug === slug)?.name || slug)
      .slice(0, 3);
    return names.join(', ') + (selectedCats.length > 3 ? '…' : '');
  }, [selectedCats, tree]);

  useEffect(() => {
    loadCategories()
      .then((data) => setTree(buildTree(data)))
      .catch(() => setTree([]));
  }, []);

  useEffect(() => {
    if (!selectedCats.length || !tree.length) return;
    const next: Record<string, boolean> = {};
    for (const root of tree) {
      if (
        selectedCats.includes(root.slug) ||
        (root.children || []).some((c) => selectedCats.includes(c.slug))
      ) {
        next[root.slug] = true;
      }
    }
    setExpanded((prev) => ({ ...prev, ...next }));
  }, [selectedCats, tree]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const params: Record<string, string | number> = { page, limit: 24, sort };
    if (selectedCats.length) params.category = selectedCats.join(',');
    if (selectedLangs.length) params.language = selectedLangs.join(',');
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;
    if (searchParams.get('exam')) params.exam = searchParams.get('exam')!;

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
  }, [selectedCats, selectedLangs, sort, minPrice, maxPrice, page, searchParams]);

  function patchParams(mutator: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams);
    mutator(next);
    next.delete('page');
    // Multi-filter lives on /shop so path slug doesn't fight checkboxes
    navigate({ pathname: '/shop', search: next.toString() ? `?${next.toString()}` : '' });
  }

  function toggleCat(slug: string) {
    patchParams((next) => {
      const set = new Set(parseList(next.get('cats')));
      // If we arrived via /shop/:slug with empty cats, seed it first
      if (!next.get('cats') && categorySlug) set.add(categorySlug);
      if (set.has(slug)) set.delete(slug);
      else set.add(slug);
      if (set.size) next.set('cats', [...set].join(','));
      else next.delete('cats');
    });
  }

  function toggleLang(lang: string) {
    patchParams((next) => {
      const set = new Set(parseList(next.get('langs')));
      if (set.has(lang)) set.delete(lang);
      else set.add(lang);
      if (set.size) next.set('langs', [...set].join(','));
      else next.delete('langs');
    });
  }

  function clearCats() {
    patchParams((next) => {
      next.delete('cats');
    });
  }

  function updateFilter(key: string, value: string) {
    patchParams((next) => {
      if (!value) next.delete(key);
      else next.set(key, value);
    });
  }

  return (
    <div className="shop-page container">
      <aside className={`shop-filters ${filtersOpen ? 'is-open' : ''}`} aria-label="Product filters">
        <button
          type="button"
          className="sf-toggle"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          {filtersOpen ? 'Hide filters' : 'Show filters & categories'}
        </button>
        <div className="sf-body">
        <section className="sf-block">
          <h2 className="sf-title">Categories</h2>
          <ul className="sf-list">
            <li>
              <button
                type="button"
                className={`sf-item ${!selectedCats.length ? 'is-active' : ''}`}
                onClick={clearCats}
              >
                <span className="sf-check" aria-hidden="true" />
                All
              </button>
            </li>
            {tree.map((root) => {
              const kids = root.children || [];
              const rootOn = selectedCats.includes(root.slug);
              const childOn = kids.some((c) => selectedCats.includes(c.slug));
              const open = !!expanded[root.slug] || rootOn || childOn;
              return (
                <li key={root.slug}>
                  <div className="sf-row">
                    <button
                      type="button"
                      className={`sf-item ${rootOn ? 'is-active' : ''}`}
                      onClick={() => {
                        if (kids.length) setExpanded((p) => ({ ...p, [root.slug]: true }));
                        toggleCat(root.slug);
                      }}
                    >
                      <span className={`sf-check ${rootOn ? 'is-on' : ''}`} aria-hidden="true" />
                      {root.name}
                    </button>
                    {kids.length ? (
                      <button
                        type="button"
                        className="sf-expand"
                        aria-expanded={open}
                        aria-label={open ? 'Collapse' : 'Expand'}
                        onClick={() => setExpanded((p) => ({ ...p, [root.slug]: !p[root.slug] }))}
                      >
                        {open ? '−' : '+'}
                      </button>
                    ) : null}
                  </div>
                  {open && kids.length ? (
                    <ul className="sf-sublist">
                      {kids.map((child) => {
                        const on = selectedCats.includes(child.slug);
                        return (
                          <li key={child.slug}>
                            <button
                              type="button"
                              className={`sf-item ${on ? 'is-active' : ''}`}
                              onClick={() => toggleCat(child.slug)}
                            >
                              <span className={`sf-check ${on ? 'is-on' : ''}`} aria-hidden="true" />
                              {child.name}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="sf-block">
          <h2 className="sf-title">Price</h2>
          <div className="sf-price">
            <input
              type="number"
              min="0"
              value={minPrice}
              onChange={(e) => updateFilter('minPrice', e.target.value)}
              placeholder="Min"
              aria-label="Min price"
            />
            <span>to</span>
            <input
              type="number"
              min="0"
              value={maxPrice}
              onChange={(e) => updateFilter('maxPrice', e.target.value)}
              placeholder="Max"
              aria-label="Max price"
            />
          </div>
        </section>

        <section className="sf-block">
          <h2 className="sf-title">Language</h2>
          <ul className="sf-list">
            {LANG_OPTIONS.map((lang) => {
              const on = selectedLangs.includes(lang);
              return (
                <li key={lang}>
                  <button
                    type="button"
                    className={`sf-item ${on ? 'is-active' : ''}`}
                    onClick={() => toggleLang(lang)}
                  >
                    <span className={`sf-check ${on ? 'is-on' : ''}`} aria-hidden="true" />
                    {lang}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        </div>
      </aside>

      <section className="shop-results">
        <div className="shop-toolbar">
          <div>
            <h1>{title}</h1>
            <p className="muted">{loading ? 'Loading…' : `${total} books`}</p>
          </div>
          <div className="sort-label">
            <span>Sort by</span>
            <select
              value={sort}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams);
                next.set('sort', e.target.value);
                next.delete('page');
                setSearchParams(next);
              }}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
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
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set('page', String(page - 1));
                setSearchParams(next);
              }}
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
