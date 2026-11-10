import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';

const ROOT_ORDER = [
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

type CatNode = {
  id?: number | string;
  name: string;
  slug: string;
  parent_id?: number | string | null;
  parentId?: number | string | null;
  children?: CatNode[];
};

function normalizeTree(payload: { tree?: CatNode[]; categories?: CatNode[] }): CatNode[] {
  const fromTree = payload.tree?.length
    ? payload.tree
    : (() => {
        const flat = payload.categories || [];
        const byParent = new Map<number | string, CatNode[]>();
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
    .filter((n) => n.slug && !HIDDEN.has(n.slug))
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
    .sort((a, b) => {
      const ia = ROOT_ORDER.indexOf(a.slug);
      const ib = ROOT_ORDER.indexOf(b.slug);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
}

export default function SearchBar() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [categories, setCategories] = useState<CatNode[]>([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQ(params.get('q') || '');
  }, [params]);

  useEffect(() => {
    let alive = true;
    api
      .get('/categories')
      .then(({ data }) => {
        if (!alive) return;
        setCategories(normalizeTree(data || {}));
      })
      .catch(() => {
        if (alive) setCategories([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function onSubmit(e) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }

  const list =
    categories.length > 0
      ? categories
      : [
          { name: 'Books', slug: 'books', children: [{ name: 'Tamil', slug: 'tamil' }] },
          { name: 'Stationery', slug: 'stationery', children: [] },
          { name: 'Toys', slug: 'toys', children: [] },
          { name: 'Competitive Exams', slug: 'competitive-exams', children: [] },
        ];

  return (
    <div className="search-bar">
      <div className="container search-bar-inner">
        <div className="browse-wrap" ref={wrapRef}>
          <button
            type="button"
            className={`browse-btn ${open ? 'is-open' : ''}`}
            aria-expanded={open}
            aria-haspopup="true"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="browse-icon" aria-hidden="true">
              ☰
            </span>
            <span className="browse-label-full">BROWSE CATEGORIES</span>
            <span className="browse-label-short">Browse</span>
          </button>
          {open ? (
            <div className="browse-dropdown" role="menu">
              <Link to="/shop" className="browse-link" role="menuitem" onClick={() => setOpen(false)}>
                All Categories
              </Link>
              {list.map((cat) => {
                const kids = cat.children || [];
                const isOpen = !!expanded[cat.slug];
                return (
                  <div key={cat.slug} className="browse-group">
                    <div className="browse-row">
                      <Link
                        to={`/shop/${cat.slug}`}
                        className="browse-link"
                        role="menuitem"
                        onClick={() => setOpen(false)}
                      >
                        {cat.name}
                      </Link>
                      {kids.length ? (
                        <button
                          type="button"
                          className="browse-expand"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? `Collapse ${cat.name}` : `Expand ${cat.name}`}
                          onClick={() =>
                            setExpanded((p) => ({ ...p, [cat.slug]: !p[cat.slug] }))
                          }
                        >
                          {isOpen ? '−' : '+'}
                        </button>
                      ) : null}
                    </div>
                    {isOpen && kids.length ? (
                      <div className="browse-sub">
                        {kids.map((child) => (
                          <Link
                            key={child.slug}
                            to={`/shop/${child.slug}`}
                            className="browse-link browse-link-sub"
                            role="menuitem"
                            onClick={() => setOpen(false)}
                          >
                            {child.name}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
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
