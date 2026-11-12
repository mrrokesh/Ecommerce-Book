import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/States';
import { firstAllowedPath, moduleForPath, NAV_GROUPS } from './modules';
import AdminIcon from './AdminIcon';
import './admin.css';
import './admin-v2.css';

const TITLES = {
  '/admin/inventory':'Inventory','/admin/payments':'Payments & refunds','/admin/returns':'Returns','/admin/reports':'Sales reports','/admin/gifts':'Gift cards','/admin/settings':'Store settings','/admin/audit':'Audit history','/admin/catalogue-tools':'Catalogue tools','/admin/security':'Account security',
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
  '/admin/campaigns': 'Promotional emails',
  '/admin/subscribers': 'Subscribers',
};

export default function AdminLayout() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const loc = useLocation();
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [usage, setUsage] = useState<{ used: number; cap: number } | null>(null);
  useEffect(() => setMenuOpen(false), [loc.pathname]);
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

  // Counts shown next to Orders, Returns and Payments, plus today's email usage; refreshed when you move between pages.
  useEffect(() => {
    if (!inPortal || !permissions) return;
    let alive = true;
    api.get('/admin/summary').then(({ data }) => {
      if (!alive) return;
      const s = data.stats || {};
      setBadges({
        '/admin/orders': Number(s.toConfirm || 0) + Number(s.toShip || 0),
        '/admin/returns': Number(s.returnsOpen || 0),
        '/admin/payments': Number(s.refundsOpen || 0),
        '/admin/inventory': Number(s.lowStock || 0),
      });
    }).catch(() => undefined);
    if (role === 'admin' || permissions.includes('marketing')) {
      api.get('/campaigns').then(({ data }) => alive && setUsage({ used: Number(data.sentToday || 0), cap: Number(data.dailyCap || 0) })).catch(() => undefined);
    }
    return () => { alive = false; };
  }, [inPortal, permissions, loc.pathname, role]);

  const title = loc.pathname.startsWith('/admin/products/') && loc.pathname !== '/admin/products/new'
    ? 'Edit product'
    : TITLES[loc.pathname] || 'Admin';

  if (loading) return <LoadingState />;
  if (!inPortal) return <Navigate to="/admin/login" state={{ from: loc.pathname }} replace />;
  if (!permissions) return <LoadingState />;

  const isAdmin = role === 'admin';
  const allowed = (module: string) => isAdmin || permissions.includes(module);
  const current = moduleForPath(loc.pathname);
  const pageAllowed = loc.pathname === '/admin/security' || (current === 'staff' ? isAdmin : allowed(current));

  if (!pageAllowed) {
    const fallback = firstAllowedPath(allowed);
    if (fallback && fallback !== loc.pathname) return <Navigate to={fallback} replace />;
  }

  const canSee = (m: string) => (m === 'any' ? true : m === 'staff' ? isAdmin : allowed(m));
  const isOn = (to: string) => (to === '/admin' ? loc.pathname === '/admin' : loc.pathname === to || loc.pathname.startsWith(to + '/'));
  const groups = NAV_GROUPS.map((g) => ({ ...g, links: g.links.filter((l) => canSee(l.module)) })).filter((g) => (g.to ? canSee(g.module || 'dashboard') : g.links.length));
  const initials = String(user.name || user.email || 'A').trim().slice(0, 1).toUpperCase();

  return (
    <div className="erp-shell">
      {menuOpen ? <div className="erp-scrim" onClick={() => setMenuOpen(false)} /> : null}
      <aside className={`erp-side${menuOpen ? ' open' : ''}`} aria-label="Admin navigation">
        <Link to="/admin" className="erp-brand">
          <img className="erp-brand-mark" src="/sbh-logo.jpg" alt="" width={36} height={36} />
          <div>
            <strong>Salem Book House</strong>
            <span>{isAdmin ? 'Store admin' : 'Staff portal'}</span>
          </div>
        </Link>
        <nav className="erp-nav">
          <div className="erp-nav-label">Menu</div>
          {groups.map((g) =>
            g.to ? (
              <NavLink key={g.key} to={g.to} end className={`erp-link${isOn(g.to) ? ' active' : ''}`}>
                <AdminIcon name={g.icon} /> <span>{g.title}</span>
              </NavLink>
            ) : (
              <NavGroupBlock key={g.key} title={g.title} icon={g.icon} links={g.links} isOn={isOn} badges={badges} />
            )
          )}
        </nav>
        {usage && usage.cap > 0 ? (
          <div className="erp-side-card" title="Emails sent in the last 24 hours against the daily limit">
            <span>Emails today</span>
            <strong>{usage.used.toLocaleString('en-IN')} <small>of {usage.cap.toLocaleString('en-IN')}</small></strong>
            <div className="erp-meter"><i style={{ width: `${Math.min(100, Math.round((usage.used / usage.cap) * 100))}%` }} /></div>
          </div>
        ) : null}
        <div className="erp-side-foot">
          <Link to="/" className="erp-link"><AdminIcon name="store" /> <span>View storefront</span></Link>
          <button type="button" className="erp-link" onClick={logout}><AdminIcon name="logout" /> <span>Sign out</span></button>
        </div>
      </aside>
      <div className="erp-main">
        <header className="erp-top">
          <button type="button" className="erp-menu-btn" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            <AdminIcon name="menu" />
          </button>
          <PageSearch groups={groups} />
          <div className="erp-top-right">
            <Link to="/" className="erp-icon-btn" title="View storefront"><AdminIcon name="store" /></Link>
            <Link to="/admin/security" className="erp-icon-btn" title="Account security"><AdminIcon name="shield" /></Link>
            <span className="erp-user">{String(user.name || user.email).split(/[\s@]/)[0]}</span>
            <span className="erp-avatar" title={user.email}>{initials}</span>
          </div>
        </header>
        <div className="erp-body">
          <div className="erp-pagehead">
            <p className="erp-crumb">{isAdmin ? 'Admin' : 'Staff'} / {title}</p>
            <h1>{title}</h1>
          </div>
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

/** Collapsible sidebar group; opens by itself when one of its pages is showing. */
function NavGroupBlock({ title, icon, links, isOn, badges }: { title: string; icon: string; links: { to: string; label: string }[]; isOn: (to: string) => boolean; badges: Record<string, number> }) {
  const active = links.some((l) => isOn(l.to));
  const [open, setOpen] = useState(active);
  useEffect(() => { if (active) setOpen(true); }, [active]);
  const total = links.reduce((n, l) => n + (badges[l.to] || 0), 0);
  return (
    <div className="erp-navgroup">
      <button type="button" className={`erp-link erp-head${open ? ' open' : ''}${active ? ' active-head' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <AdminIcon name={icon} /> <span>{title}</span>
        {!open && total > 0 ? <em className="erp-badge">{total > 99 ? '99+' : total}</em> : null}
        <AdminIcon name="chevron" size={14} className="erp-chev" />
      </button>
      {open ? links.map((l) => {
        const best = isOn(l.to) && !links.some((o) => o.to !== l.to && o.to.length > l.to.length && isOn(o.to));
        const n = badges[l.to] || 0;
        return (
          <NavLink key={l.to} to={l.to} end className={`erp-link sub${best ? ' active' : ''}`}>
            <span>{l.label}</span>
            {n > 0 ? <em className="erp-badge">{n > 99 ? '99+' : n}</em> : null}
          </NavLink>
        );
      }) : null}
    </div>
  );
}

/** Jump-to-page search in the top bar (type a page name, press Enter). */
function PageSearch({ groups }: { groups: { title: string; to?: string; links: { to: string; label: string }[] }[] }) {
  const [term, setTerm] = useState('');
  const navigate = useNavigate();
  const all = groups.flatMap((g) => (g.to ? [{ to: g.to, label: g.title }] : g.links.map((l) => ({ to: l.to, label: `${g.title} / ${l.label}` }))));
  const hits = term.trim() ? all.filter((l) => l.label.toLowerCase().includes(term.trim().toLowerCase())).slice(0, 6) : [];
  return (
    <div className="erp-search" data-no-validate>
      <AdminIcon name="search" size={16} />
      <input type="text" placeholder="Jump to a page: orders, coupons, returns…" value={term} aria-label="Jump to a page"
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { navigate(hits[0].to); setTerm(''); } if (e.key === 'Escape') setTerm(''); }} />
      {hits.length ? (
        <ul className="erp-search-pop" role="listbox">
          {hits.map((h) => <li key={h.to}><button type="button" onClick={() => { navigate(h.to); setTerm(''); }}>{h.label}</button></li>)}
        </ul>
      ) : null}
    </div>
  );
}
