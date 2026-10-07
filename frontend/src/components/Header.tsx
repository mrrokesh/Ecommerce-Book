import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import type { CategoryNode } from '../types';
import { loadCategories } from '../api/cache';
import api from '../api/client';

const NAV = [
  { label: 'BOOKS', to: '/shop/books', slug: 'books' },
  { label: 'KANNADA', to: '/shop/kannada', slug: 'kannada' },
  { label: 'STATIONERY', to: '/shop/stationery', badge: 'NEW', slug: 'stationery' },
  { label: 'TOYS', to: '/shop/toys', slug: 'toys' },
  { label: 'COMPETITIVE EXAMS', to: '/shop/competitive-exams', slug: 'competitive-exams' },
  { label: 'PRE-ORDER', to: '/shop/pre-order', slug: 'pre-order' },
  { label: 'NEW ARRIVALS', to: '/shop/new-arrivals', slug: 'new-arrivals' },
  { label: 'E GIFT CARD', to: '/shop/e-gift-card', slug: 'e-gift-card' },
];

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

  useEffect(() => {
    loadCategories()
      .then((data) => setTree(data.tree || []))
      .catch(() => setTree([]));
  }, []);

  function childrenFor(slug: string) {
    const node = tree.find((c) => c.slug === slug);
    return node?.children || [];
  }

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
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">SBH</span>
          <span className="brand-text">
            <span className="brand-name">Salem Book House</span>
            <span className="brand-tagline">Salem&apos;s Favourite Book Mall</span>
          </span>
        </Link>

        <nav className="main-nav" aria-label="Primary">
          {NAV.map((item) => {
            const kids = childrenFor(item.slug);
            return (
              <div key={item.to} className="nav-item">
                <NavLink to={item.to} className="nav-link">
                  {item.label}
                  {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                </NavLink>
                {kids.length ? (
                  <div className="mega-menu mega-menu-cols">
                    {kids.map((c) => (
                      <div key={c.slug} className="mega-col">
                        <Link to={`/shop/${c.slug}`} className="mega-parent">
                          {c.name}
                        </Link>
                        {(c.children || []).slice(0, 8).map((g: CategoryNode) => (
                          <Link key={g.slug} to={`/shop/${g.slug}`}>
                            {g.name}
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="header-actions">
          {isAuthenticated ? (
            <div className="account-menu">
              <Link to="/account" className="icon-btn" title={user?.name || 'Account'} aria-label="Account">
                <UserIcon />
              </Link>
              {user?.role === 'admin' ? (
                <Link to="/admin/products" className="text-btn">
                  Admin
                </Link>
              ) : null}
              <button type="button" className="text-btn" onClick={logout}>
                Logout
              </button>
            </div>
          ) : (
            <Link to="/login" className="icon-btn" title="Login" aria-label="Login">
              <UserIcon />
            </Link>
          )}
          <Link to="/wishlist" className="icon-btn" title="Wishlist" aria-label="Wishlist">
            <HeartIcon />
          </Link>
          <Link to="/cart" className="icon-btn cart-btn" title="Cart" aria-label="Cart">
            <CartIcon />
            {itemCount > 0 ? <span className="cart-badge">{itemCount > 99 ? '99+' : itemCount}</span> : null}
          </Link>
        </div>
      </div>

      <div className="promo-strip promo-strip-pin">
        <Link to="/shop/books">Express Delivery · Coupon WELCOME10 · Shop Now!</Link>
        <form className="header-pin" onSubmit={checkPin}>
          <label htmlFor="header-pin">Pincode</label>
          <input
            id="header-pin"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="636001"
          />
          <button type="submit">Check</button>
          {pinMsg ? <span className="pin-msg">{pinMsg}</span> : null}
        </form>
      </div>
    </header>
  );
}

function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19c1.8-3.2 4.2-4.8 7-4.8s5.2 1.6 7 4.8" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 7.5a3.8 3.8 0 0 1 7 3.3C19 15.6 12 20 12 20z" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 7h14l-1.4 9.2a2 2 0 0 1-2 1.7H9.2a2 2 0 0 1-2-1.6L5.2 4.5A1.5 1.5 0 0 0 3.7 3.3H2" />
      <circle cx="10" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </svg>
  );
}
