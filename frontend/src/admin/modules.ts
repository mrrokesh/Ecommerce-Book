/** Admin portal sections a staff role can be granted. Keys match ADMIN_MODULES on the API. */
export const MODULES: { key: string; label: string; hint: string }[] = [
  { key: 'refunds', label: 'Refunds', hint: 'Issue and reconcile refunds' },
  { key: 'orders_edit', label: 'Edit orders', hint: 'Change fulfilment status' },
  { key: 'products_edit', label: 'Edit products', hint: 'Change catalogue and stock' },
  { key: 'dashboard', label: 'Dashboard', hint: 'Sales summary and revenue' },
  { key: 'orders', label: 'Orders', hint: 'View orders, update status, ship, invoices, refunds' },
  { key: 'products', label: 'Products', hint: 'Add and edit products, images, ERP sync' },
  { key: 'categories', label: 'Categories', hint: 'Store categories and menus' },
  { key: 'customers', label: 'Customers', hint: 'Customer list and contact details' },
  { key: 'reviews', label: 'Reviews', hint: 'Show or hide product reviews' },
  { key: 'shipping', label: 'Shipping partners', hint: 'Courier settings and credentials' },
  { key: 'marketing', label: 'Banners & coupons', hint: 'Homepage banners and discount codes' },
  { key: 'emails', label: 'Email outbox', hint: 'Emails sent by the store' },
  { key: 'support', label: 'Complaints', hint: 'View, answer and resolve customer complaints' },
];

export const MODULE_LABEL: Record<string, string> = Object.fromEntries(MODULES.map((m) => [m.key, m.label]));

export type NavLinkDef = { to: string; label: string; module: string };
export type NavGroup = { key: string; title: string; icon: string; to?: string; module?: string; links: NavLinkDef[] };

/** Sidebar structure: single links (Home) and collapsible groups. 'staff' modules are admin-only. */
export const NAV_GROUPS: NavGroup[] = [
  { key: 'home', title: 'Home', icon: 'home', to: '/admin', module: 'dashboard', links: [] },
  {
    key: 'catalogue', title: 'Catalogue', icon: 'catalogue',
    links: [
      { to: '/admin/products', label: 'Products', module: 'products' },
      { to: '/admin/products/new', label: 'Add product', module: 'products' },
      { to: '/admin/categories', label: 'Categories', module: 'categories' },
      { to: '/admin/inventory', label: 'Inventory', module: 'products' },
      { to: '/admin/catalogue-tools', label: 'Import & bulk tools', module: 'products_edit' },
    ],
  },
  {
    key: 'sales', title: 'Sales', icon: 'sales',
    links: [
      { to: '/admin/orders', label: 'Orders', module: 'orders' },
      { to: '/admin/returns', label: 'Returns', module: 'orders' },
      { to: '/admin/customers', label: 'Customers', module: 'customers' },
      { to: '/admin/reviews', label: 'Reviews', module: 'reviews' },
      { to: '/admin/complaints', label: 'Complaints', module: 'support' },
      { to: '/admin/gifts', label: 'Gift cards', module: 'marketing' },
    ],
  },
  {
    key: 'payments', title: 'Payments', icon: 'money',
    links: [
      { to: '/admin/payments', label: 'Payments & refunds', module: 'refunds' },
      { to: '/admin/reports', label: 'Sales reports', module: 'dashboard' },
    ],
  },
  { key: 'fulfilment', title: 'Fulfilment', icon: 'truck', links: [{ to: '/admin/shipping', label: 'Shipping partners', module: 'shipping' }] },
  {
    key: 'marketing', title: 'Marketing', icon: 'megaphone',
    links: [
      { to: '/admin/marketing', label: 'Banners & coupons', module: 'marketing' },
      { to: '/admin/campaigns', label: 'Promotional emails', module: 'marketing' },
      { to: '/admin/subscribers', label: 'Subscribers', module: 'marketing' },
      { to: '/admin/emails', label: 'Email outbox', module: 'emails' },
    ],
  },
  {
    key: 'settings', title: 'Settings', icon: 'settings',
    links: [
      { to: '/admin/settings', label: 'Store settings', module: 'staff' },
      { to: '/admin/staff', label: 'Staff & roles', module: 'staff' },
      { to: '/admin/audit', label: 'Audit history', module: 'staff' },
      { to: '/admin/security', label: 'Account security', module: 'any' },
      { to: '/admin/help', label: 'Help & guide', module: 'any' },
    ],
  },
];

/** Flat list kept for firstAllowedPath and page-title lookups. */
export const NAV_SECTIONS: { title: string; links: NavLinkDef[] }[] = NAV_GROUPS.map((g) => ({
  title: g.title,
  links: g.to ? [{ to: g.to, label: g.title, module: g.module || 'dashboard' }] : g.links.filter((l) => l.module !== 'staff' && l.module !== 'any'),
}));

/** Module that guards an admin URL ('staff' means admin-only). */
export function moduleForPath(pathname: string) {
  if (pathname === '/admin' || pathname === '/admin/') return 'dashboard';
  const seg = pathname.replace(/^\/admin\/?/, '').split('/')[0];
  const map: Record<string, string> = {
    inventory:'products',payments:'refunds',returns:'orders',reports:'dashboard',gifts:'marketing','catalogue-tools':'products_edit',
    products: 'products',
    categories: 'categories',
    orders: 'orders',
    customers: 'customers',
    reviews: 'reviews',
    shipping: 'shipping',
    marketing: 'marketing',
    campaigns: 'marketing',
    subscribers: 'marketing',
    complaints: 'support',
    help: 'any',
    security: 'any',
    emails: 'emails',
    staff: 'staff',
  };
  return map[seg] || 'staff';
}

export function firstAllowedPath(allowed: (module: string) => boolean) {
  for (const section of NAV_SECTIONS) {
    const link = section.links.find((l) => allowed(l.module));
    if (link) return link.to;
  }
  return null;
}
