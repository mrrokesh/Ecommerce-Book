import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/States';
import { firstAllowedPath, moduleForPath, NAV_SECTIONS } from './modules';
import './admin.css';

const TITLES = {
  '/admin': 'Dashboard',
  '/admin/products': 'Products',
  '/admin/products/new': 'New product',
  '/admin/categories': 'Categories',
  '/admin/orders': 'Orders',
  '/admin/customers': 'Customers',
  '/admin/marketing': 'Banners & coupons',
  '/admin/pages': 'CMS pages',
  '/admin/emails': 'Email outbox',
  '/admin/shipping': 'Shipping partners',
  '/admin/reviews': 'Reviews',
  '/admin/staff': 'Staff & roles',
};

export default function AdminLayout() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const loc = useLocation();
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const role = user?.role;
  const inPortal = isAuthenticated && (role === 'admin' || role === 'staff');

  useEffect(() => {
    if (!inPortal) return;
    let alive = true;
    api
      .get('/admin/me')
      .then(({ data }) => alive && setPermissions(data.permissions || []))
      .catch(() => alive && setPermissions([]));
    return () => {
      alive = false;
    };
  }, [inPortal, user?.id]);

  const title = loc.pathname.startsWith('/admin/products/') && loc.pathname !== '/admin/products/new'
    ? 'Edit product'
    : TITLES[loc.pathname] || 'Admin';

  if (loading) return <LoadingState />;
  if (!inPortal) return <Navigate to="/admin/login" state={{ from: loc.pathname }} replace />;
  if (!permissions) return <LoadingState />;

  const isAdmin = role === 'admin';
  const allowed = (module: string) => isAdmin || permissions.includes(module);
  const current = moduleForPath(loc.pathname);
  const pageAllowed = current === 'staff' ? isAdmin : allowed(current);

  if (!pageAllowed) {
    const fallback = firstAllowedPath(allowed);
    if (fallback && fallback !== loc.pathname) return <Navigate to={fallback} replace />;
  }

  return (
    <div className="erp-shell">
      <aside className="erp-side">
        <div className="erp-brand">
          <div>
            <strong>Salem Book House</strong>
            <span>{isAdmin ? 'Store admin' : 'Staff portal'}</span>
          </div>
        </div>
        <nav className="erp-nav">
          {NAV_SECTIONS.map((section) => {
            const links = section.links.filter((l) => allowed(l.module));
            if (!links.length) return null;
            return (
              <div key={section.title} style={{ display: 'contents' }}>
                <div className="erp-group">{section.title}</div>
                {links.map((l) => (
                  <NavLink key={l.to} to={l.to} end={l.to === '/admin'}>
                    {l.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
          {isAdmin ? (
            <>
              <div className="erp-group">Store</div>
              <NavLink to="/admin/staff">Staff & roles</NavLink>
              <Link to="/">View storefront</Link>
            </>
          ) : null}
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </nav>
      </aside>
      <div className="erp-main">
        <header className="erp-top">
          <div>
            <p className="erp-crumb">{isAdmin ? 'Admin' : 'Staff'} / {title}</p>
            <h1>{title}</h1>
          </div>
          <span className="muted">{user.email}</span>
        </header>
        <div className="erp-body">
          {pageAllowed ? (
            <Outlet />
          ) : (
            <div className="erp-card" style={{ padding: '1.25rem' }}>
              <h3 style={{ marginTop: 0 }}>No sections assigned</h3>
              <p className="muted" style={{ margin: 0 }}>
                Your role does not include any admin sections yet. Ask the store admin to update your access.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
