import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import type { CategoryNode } from '../types';
import { loadCategories } from '../api/cache';
import api from '../api/client';

/** Top-level categories beyond this many (by admin sort order) go under MORE. */
const MAIN_NAV_COUNT = 7;

/** Short tab labels for long category names; anything else shows its own name. */
const NAV_LABELS: Record<string, string> = {
  'school-board': 'School',
  'competitive-exams': 'Exams',
};

/** Myntra-style column groups (title + child slugs). Unknown slugs are skipped. */
const MEGA_GROUPS: Record<string, { title: string; slugs: string[] }[]> = {
  books: [
    { title: 'Languages', slugs: ['tamil'] },
    { title: 'Popular Reads', slugs: ['novels', 'fiction', 'non-fiction', 'general-books'] },
    { title: 'Children & Classics', slugs: ['children-books', 'epics', 'astrology'] },
  ],
  'school-board': [
    { title: 'Boards', slugs: ['ncert', 'cbse-guides', 'state-board-guides', 'scert'] },
  ],
  'competitive-exams': [
    { title: 'Exams', slugs: ['tnpsc', 'neet', 'jee', 'upsc', 'banking'] },
  ],
  college: [
    { title: 'College', slugs: ['college-textbooks', 'medical', 'nursing'] },
  ],
  stationery: [
    {
      title: 'Stationery',
      slugs: ['school-bags', 'notebooks', 'art-supplies', 'pens'],
    },
  ],
};

function buildMegaColumns(slug: string, title: string, kids: CategoryNode[]) {
  if (!kids.length) return [];

  // Few links → one tight column (no giant empty panel)
  if (kids.length <= 6) {
    return [{ title, links: kids }];
  }

  const bySlug = new Map(kids.map((k) => [k.slug, k]));
  const groups = MEGA_GROUPS[slug];
  if (groups?.length) {
    const used = new Set<string>();
    const cols = groups
      .map((g) => {
        const links = g.slugs.map((s) => bySlug.get(s)).filter(Boolean) as CategoryNode[];
        links.forEach((l) => used.add(l.slug));
        return { title: g.title, links };
      })
      .filter((c) => c.links.length);
    const leftover = kids.filter((k) => !used.has(k.slug));
    if (leftover.length) {
      if (cols.length === 1) cols[0].links.push(...leftover);
      else cols.push({ title: 'More', links: leftover });
    }
    return cols;
  }

  const size = Math.max(4, Math.ceil(kids.length / 3) || 4);
  const cols: { title: string; links: CategoryNode[] }[] = [];
  for (let i = 0; i < kids.length; i += size) {
    const slice = kids.slice(i, i + size);
    cols.push({
      title: slice[0]?.name || 'Shop',
      links: slice.length > 1 ? slice.slice(1) : slice,
    });
  }
  return cols;
}

export default function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const { itemCount } = useCart();
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [pin, setPin] = useState(() => {
    try {
      return localStorage.getItem('sbh_pincode') || '';
    } catch {
      return '';
    }
  });
  const [pinMsg, setPinMsg] = useState('');
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    loadCategories()
      .then((data) => setTree(data.tree || []))
      .catch(() => setTree([]));
  }, []);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    function syncHeight() {
      const h = el?.offsetHeight || 72;
      document.documentElement.style.setProperty('--site-header-height', `${h}px`);
    }
    syncHeight();
    const ro = new ResizeObserver(syncHeight);
    ro.observe(el);
    window.addEventListener('resize', syncHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', syncHeight);
    };
  }, []);

  const mainNav = tree.slice(0, MAIN_NAV_COUNT);
  const moreNav = tree.slice(MAIN_NAV_COUNT);

  async function checkPin(e: FormEvent) {
    e.preventDefault();
    const clean = pin.replace(/\D/g, '');
    if (clean.length !== 6) {
      setPinMsg('Enter 6-digit pincode');
      return;
    }
    try {
      const { data } = await api.get(`/pincode/${clean}`);
      setPinMsg(data.message || (data.serviceable ? 'Deliverable' : 'Not serviceable'));
      try {
        localStorage.setItem('sbh_pincode', clean);
      } catch {
        /* ignore */
      }
    } catch (err: any) {
      setPinMsg(err.message || 'Check failed');
    }
  }

  return (
    <>
      <header className="site-header" ref={headerRef}>
        <div className="container header-inner">
          <Link to="/" className="brand" aria-label="Salem Book House home">
            <img className="brand-logo" src="/sbh-logo.jpg" alt="" width={52} height={52} />
            <span className="brand-text">
              <span className="brand-name">Salem Book House</span>
              <span className="brand-tagline">Salem&apos;s Favourite Book Mall</span>
            </span>
          </Link>

          <nav className="main-nav" aria-label="Primary">
            {mainNav.map((cat) => {
              const kids = cat.children || [];
              const item = { slug: cat.slug, to: `/shop/${cat.slug}` };
              const columns = buildMegaColumns(cat.slug, cat.name || cat.slug, kids);
              return (
                <div key={cat.slug} className={`nav-item ${kids.length ? 'has-mega' : ''}`}>
                  <Link to={item.to} className="nav-link">
                    {(NAV_LABELS[cat.slug] || cat.name || cat.slug).toUpperCase()}
                    {cat.badge ? <span className="nav-badge">{cat.badge}</span> : null}
                  </Link>
                  {columns.length ? (
                    <div
                      className={`mega-menu mega-panel ${columns.length === 1 ? 'mega-panel-compact' : ''}`}
                      role="menu"
                    >
                      <div className="mega-cols">
                        {columns.map((col) => (
                          <div className="mega-col" key={`${item.slug}-${col.title}`}>
                            <Link to={item.to} className="mega-heading" role="menuitem">
                              {col.title}
                            </Link>
                            {col.links.map((c) => (
                              <Link key={c.slug} to={`/shop/${c.slug}`} role="menuitem">
                                {c.name}
                              </Link>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {moreNav.length ? (
              <div className="nav-item has-mega">
                <span className="nav-link nav-more-label" tabIndex={0}>
                  MORE
                </span>
                <div className="mega-menu mega-panel mega-panel-more" role="menu">
                  <div className="mega-cols">
                    <div className="mega-col">
                      <span className="mega-heading">More to explore</span>
                      {moreNav.map((cat) => (
                        <Link key={cat.slug} to={`/shop/${cat.slug}`} role="menuitem">
                          {cat.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </nav>

          <div className="header-actions">
            <div className="profile-menu">
              {isAuthenticated ? (
                <>
                  <button type="button" className="action-btn" aria-haspopup="true">
                    <UserIcon />
                    <span>Profile</span>
                  </button>
                  <div className="profile-dropdown" role="menu">
                    <p className="profile-hello">Hi, {user?.name?.split(' ')[0] || 'there'}</p>
                    <Link to="/account" role="menuitem">
                      My Account
                    </Link>
                    <Link to="/account/orders" role="menuitem">
                      Orders
                    </Link>
                    <button type="button" role="menuitem" onClick={logout}>
                      Logout
                    </button>
                  </div>
                </>
              ) : (
                <Link to="/login" className="action-btn" title="Login">
                  <UserIcon />
                  <span>Profile</span>
                </Link>
              )}
            </div>
            <Link to="/wishlist" className="action-btn" title="Wishlist">
              <HeartIcon />
              <span>Wishlist</span>
            </Link>
            <Link to="/cart" className="action-btn cart-btn" title="Cart">
              <CartIcon />
              <span>Bag</span>
              {itemCount > 0 ? <span className="cart-badge">{itemCount > 99 ? '99+' : itemCount}</span> : null}
            </Link>
          </div>
        </div>
      </header>

      <div className="promo-strip promo-strip-pin">
        <div className="container promo-strip-inner">
          <Link className="promo-strip-offer" to="/shop/books">
            Express Delivery · Coupon WELCOME10 · Shop Now!
          </Link>
          <form className="header-pin" onSubmit={checkPin}>
            <span className="header-pin-icon" aria-hidden="true">
              <PinIcon />
            </span>
            <div className="header-pin-fields">
              <label htmlFor="header-pin">Deliver to</label>
              <input
                id="header-pin"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter pincode"
                aria-label="Delivery pincode"
              />
            </div>
            <button type="submit">Check</button>
          </form>
          {pinMsg ? <span className="pin-msg">{pinMsg}</span> : null}
        </div>
      </div>
    </>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21s-6-5.4-6-10a6 6 0 1 1 12 0c0 4.6-6 10-6 10z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19c1.8-3.2 4.2-4.8 7-4.8s5.2 1.6 7 4.8" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 7.5a3.8 3.8 0 0 1 7 3.3C19 15.6 12 20 12 20z" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 7h14l-1.4 9.2a2 2 0 0 1-2 1.7H9.2a2 2 0 0 1-2-1.6L5.2 4.5A1.5 1.5 0 0 0 3.7 3.3H2" />
      <circle cx="10" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </svg>
  );
}
