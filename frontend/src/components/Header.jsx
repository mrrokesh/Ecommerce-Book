import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import api from '../api/client';

const NAV = [
  { label: 'BOOKS', to: '/shop/books', slug: 'books' },
  { label: 'KANNADA', to: '/shop/kannada', slug: 'kannada' },
  { label: 'STATIONERY', to: '/shop/stationery', badge: 'NEW', slug: 'stationery' },
  { label: 'TOYS', to: '/shop/toys', slug: 'toys' },
  { label: 'COMPETITIVE EXAMS', to: '/shop/competitive-exams', slug: 'competitive-exams' },
  { label: 'E GIFT CARD', to: '/shop/e-gift-card', slug: 'e-gift-card' },
];

export default function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const { itemCount } = useCart();
  const [tree, setTree] = useState([]);

  useEffect(() => {
    api
      .get('/categories')
      .then(({ data }) => setTree(data.tree || []))
      .catch(() => setTree([]));
  }, []);

  function childrenFor(slug) {
    const node = tree.find((c) => c.slug === slug);
    return node?.children || [];
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
                  <div className="mega-menu">
                    {kids.map((c) => (
                      <Link key={c.slug} to={`/shop/${c.slug}`}>
                        {c.name}
                      </Link>
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
                <Link to="/admin" className="text-btn">
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

      <div className="promo-strip">
        <Link to="/shop/books">Express Delivery · Coupon WELCOME10 · Shop Now!</Link>
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
