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
  { key: 'pages', label: 'CMS pages', hint: 'About, Contact, FAQ, Terms, Privacy' },
  { key: 'emails', label: 'Email outbox', hint: 'Emails sent by the store' },
];

export const MODULE_LABEL: Record<string, string> = Object.fromEntries(MODULES.map((m) => [m.key, m.label]));

export const NAV_SECTIONS: { title: string; links: { to: string; label: string; module: string }[] }[] = [
  { title: 'Operations', links: [
    {to:'/admin/inventory',label:'Inventory',module:'products'},
    {to:'/admin/catalogue-tools',label:'Import & bulk tools',module:'products_edit'},
    {to:'/admin/payments',label:'Payments & refunds',module:'refunds'},
    {to:'/admin/returns',label:'Returns',module:'orders'},
    {to:'/admin/reports',label:'Sales reports',module:'dashboard'},
    {to:'/admin/gifts',label:'Gift cards',module:'marketing'},
  ]},
  { title: 'Overview', links: [{ to: '/admin', label: 'Dashboard', module: 'dashboard' }] },
  {
    title: 'Catalogue',
    links: [
      { to: '/admin/products', label: 'Product list', module: 'products' },
      { to: '/admin/products/new', label: 'Add product', module: 'products' },
      { to: '/admin/categories', label: 'Categories', module: 'categories' },
    ],
  },
  {
    title: 'Sales',
    links: [
      { to: '/admin/orders', label: 'Orders', module: 'orders' },
      { to: '/admin/customers', label: 'Customers', module: 'customers' },
      { to: '/admin/reviews', label: 'Reviews', module: 'reviews' },
    ],
  },
  { title: 'Fulfilment', links: [{ to: '/admin/shipping', label: 'Shipping partners', module: 'shipping' }] },
  {
    title: 'Content',
    links: [
      { to: '/admin/marketing', label: 'Banners & coupons', module: 'marketing' },
      { to: '/admin/pages', label: 'CMS pages', module: 'pages' },
      { to: '/admin/emails', label: 'Email outbox', module: 'emails' },
    ],
  },
];

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
    pages: 'pages',
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
