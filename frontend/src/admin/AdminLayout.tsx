import { NavLink, Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/States';
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
  '/admin/staff': 'Staff',
};

export default function AdminLayout() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const loc = useLocation();
  const title = loc.pathname.startsWith('/admin/products/') && loc.pathname !== '/admin/products/new'
    ? 'Edit product'
    : TITLES[loc.pathname] || 'Admin';

  if (loading) return <LoadingState />;
  const role = user?.role;
  if (!isAuthenticated || (role !== 'admin' && role !== 'staff')) {
    return <Navigate to="/admin/login" state={{ from: loc.pathname }} replace />;
  }
  const isStaff = role === 'staff';
  // Staff only manage orders; any other admin page sends them back to Orders.
  if (isStaff && !loc.pathname.startsWith('/admin/orders')) {
    return <Navigate to="/admin/orders" replace />;
  }

  return (
    <div className="erp-shell">
      <aside className="erp-side">
        <div className="erp-brand">
          <div>
            <strong>Salem Book House</strong>
            <span>{isStaff ? 'Staff portal' : 'Store admin'}</span>
          </div>
        </div>
        <nav className="erp-nav">
          {isStaff ? (
            <>
              <div className="erp-group">Sales</div>
              <NavLink to="/admin/orders">Orders</NavLink>
            </>
          ) : (
            <>
              <div className="erp-group">Overview</div>
              <NavLink to="/admin" end>
                Dashboard
              </NavLink>
              <div className="erp-group">Catalogue</div>
              <NavLink to="/admin/products">Product list</NavLink>
              <NavLink to="/admin/products/new">Add product</NavLink>
              <NavLink to="/admin/categories">Categories</NavLink>
              <div className="erp-group">Sales</div>
              <NavLink to="/admin/orders">Orders</NavLink>
              <NavLink to="/admin/customers">Customers</NavLink>
              <NavLink to="/admin/reviews">Reviews</NavLink>
              <div className="erp-group">Fulfilment</div>
              <NavLink to="/admin/shipping">Shipping partners</NavLink>
              <div className="erp-group">Content</div>
              <NavLink to="/admin/marketing">Banners & coupons</NavLink>
              <NavLink to="/admin/pages">CMS pages</NavLink>
              <NavLink to="/admin/emails">Email outbox</NavLink>
              <div className="erp-group">Store</div>
              <NavLink to="/admin/staff">Staff</NavLink>
              <Link to="/">View storefront</Link>
            </>
          )}
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </nav>
      </aside>
      <div className="erp-main">
        <header className="erp-top">
          <div>
            <p className="erp-crumb">{isStaff ? 'Staff' : 'Admin'} / {title}</p>
            <h1>{title}</h1>
          </div>
          <span className="muted">{user.email}</span>
        </header>
        <div className="erp-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
