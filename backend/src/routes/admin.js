import { checks } from '../utils/validate.js';
import { safeLink } from '../utils/safeLink.js';
import { transitionOrder } from '../domain/lifecycle.js';
import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { query, getPool } from '../db/pool.js';
import bcrypt from 'bcryptjs';
import { requireBackOffice, ADMIN_MODULES } from '../middleware/auth.js';
import { mapBook } from '../utils/bookMapper.js';
import { isErpConfigured } from '../erp/mcp.js';
import { syncErpProducts, lastErpSync } from '../erp/syncProducts.js';
import { restockOrder, nextPaymentStatus } from './orders.js';
import { refundRazorpayPayment } from './payments.js';
import { notifyOrderEvent } from '../notify/index.js';

const router = Router();
router.use(requireBackOffice);

router.get('/me', (req, res) =>
  res.json({ success: true, data: { role: req.user.role, permissions: req.permissions } })
);

// Which module each admin API path belongs to. Anything unlisted (staff, roles) is admin-only.
const MODULE_ROUTES = [
  [/^\/summary(\/|$)/, ['dashboard']],
  [/^\/orders(\/|$)/, ['orders']],
  [/^\/(books|erp|covers)(\/|$)/, ['products']],
  // The product form reads the category list, so product editors may list categories.
  [/^\/categories(\/|$)/, (req) => (req.method === 'GET' ? ['categories', 'products'] : ['categories'])],
  [/^\/upload(\/|$)/, ['products', 'marketing']],
  [/^\/customers(\/|$)/, ['customers']],
  [/^\/(banners|coupons)(\/|$)/, ['marketing']],
  [/^\/order-alerts(\/|$)/, ['orders']],
  [/^\/pages(\/|$)/, ['pages']],
  [/^\/emails(\/|$)/, ['emails']],
];

router.use((req, res, next) => {
  if (req.user.role === 'admin') return next();
  const match = MODULE_ROUTES.find(([re]) => re.test(req.path));
  if (match) {
    const needed = typeof match[1] === 'function' ? match[1](req) : match[1];
    if (needed.some((m) => req.permissions.includes(m))) return next();
  }
  return res.status(403).json({ success: false, error: 'You do not have access to this section' });
});

router.use((req,res,next)=>{
  if(req.user.role!=='admin' && !['GET','HEAD'].includes(req.method)){
    const needed=/^\/orders/.test(req.path)?'orders_edit':/^\/(books|erp|covers)/.test(req.path)?'products_edit':null;
    if(needed&&!req.permissions.includes(needed))return res.status(403).json({success:false,error:'Your role has read-only access to this section'});
  }
  if(!['GET','HEAD'].includes(req.method))res.on('finish',()=>{
    if(res.statusCode<400)query('INSERT INTO audit_log(actor_id,actor_name,action,entity_id) VALUES($1,$2,$3,$4)',[req.user.id,req.user.name,req.method+' '+req.path,req.params.id || req.path]).catch(console.error);
  });
  next();
});
// Uploads live in Postgres, not on disk: Render's filesystem is wiped on every deploy.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype || '')),
});

const ORDER_STATUSES = [
  'placed',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'return_requested',
  'return_approved',
  'returned',
];
const RESTOCK_STATUSES = ['cancelled', 'returned'];

function optText(v) {
  if (v === undefined || v === null) return null;
  return String(v).trim();
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

router.get('/summary', async (_req, res) => {
  try {
    const [books, orders, users, revenue, pending, lowStock] = await Promise.all([
      query(`SELECT COUNT(*)::int AS c FROM books`),
      query(`SELECT COUNT(*)::int AS c FROM orders`),
      query(`SELECT COUNT(*)::int AS c FROM users WHERE role <> 'admin'`),
      query(
        `SELECT COALESCE(SUM(total),0)::numeric AS s FROM orders WHERE payment_status = 'paid' AND status NOT IN ('cancelled','returned')`
      ),
      query(`SELECT COUNT(*)::int AS c FROM orders WHERE status IN ('placed','confirmed','packed')`),
      query(`SELECT COUNT(*)::int AS c FROM books WHERE is_active = TRUE AND stock <= 5`),
    ]);
    const recent = await query(
      `SELECT id, order_number, status, total, payment_method, created_at
       FROM orders ORDER BY created_at DESC LIMIT 12`
    );
    // Extra numbers for the dashboard's pending-actions panel; each one is best-effort so an older database still loads.
    const safe = async (sql, fallback) => { try { return (await query(sql)).rows; } catch { return fallback; } };
    const [toConfirm, toShip, inTransit, returnsOpen, refundsOpen, subs, today, low] = await Promise.all([
      safe(`SELECT COUNT(*)::int AS c FROM orders WHERE status = 'placed'`, [{ c: 0 }]),
      safe(`SELECT COUNT(*)::int AS c FROM orders WHERE status IN ('confirmed','packed')`, [{ c: 0 }]),
      safe(`SELECT COUNT(*)::int AS c FROM orders WHERE status IN ('shipped','out_for_delivery')`, [{ c: 0 }]),
      safe(`SELECT COUNT(*)::int AS c FROM return_cases WHERE status IN ('requested','approved')`, [{ c: 0 }]),
      safe(`SELECT COUNT(*)::int AS c FROM refund_requests WHERE status IN ('pending','processing')`, [{ c: 0 }]),
      safe(`SELECT COUNT(*)::int AS c FROM users WHERE role = 'customer' AND marketing_opt_in = TRUE`, [{ c: 0 }]),
      safe(`SELECT COUNT(*)::int AS c, COALESCE(SUM(total),0)::numeric AS s FROM orders WHERE created_at >= date_trunc('day', NOW()) AND status NOT IN ('cancelled')`, [{ c: 0, s: 0 }]),
      safe(`SELECT id, title, stock FROM books WHERE is_active = TRUE AND stock <= 5 ORDER BY stock ASC, title LIMIT 6`, []),
    ]);
    return res.json({
      success: true,
      data: {
        stats: {
          books: books.rows[0].c,
          orders: orders.rows[0].c,
          users: users.rows[0].c,
          revenue: Number(revenue.rows[0].s),
          pendingOrders: pending.rows[0].c,
          lowStock: lowStock.rows[0].c,
          toConfirm: toConfirm[0].c,
          toShip: toShip[0].c,
          inTransit: inTransit[0].c,
          returnsOpen: returnsOpen[0].c,
          refundsOpen: refundsOpen[0].c,
          subscribers: subs[0].c,
          todayOrders: today[0].c,
          todayRevenue: Number(today[0].s),
        },
        lowStockItems: low,
        recentOrders: recent.rows.map((o) => ({
          id: o.id,
          orderNumber: o.order_number,
          status: o.status,
          total: Number(o.total),
          paymentMethod: o.payment_method,
          createdAt: o.created_at,
        })),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to load admin summary' });
  }
});

async function categoriesForBooks(ids) {
  if (!ids.length) return {};
  const { rows } = await query(
    `SELECT bc.book_id, c.id, c.name, c.slug
     FROM book_categories bc
     JOIN categories c ON c.id = bc.category_id
     WHERE bc.book_id = ANY($1::int[])
     ORDER BY c.name`,
    [ids]
  );
  const map = {};
  for (const r of rows) {
    if (!map[r.book_id]) map[r.book_id] = [];
    map[r.book_id].push({ id: r.id, name: r.name, slug: r.slug });
  }
  return map;
}

async function setBookCategories(bookId, categoryIds) {
  if (!Array.isArray(categoryIds)) return;
  await query(`DELETE FROM book_categories WHERE book_id = $1`, [bookId]);
  for (const raw of categoryIds) {
    const id = Number(raw);
    if (!id) continue;
    await query(`INSERT INTO book_categories (book_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
      bookId,
      id,
    ]);
  }
}

async function upsertAuthor(name) {
  const { rows } = await query(
    `INSERT INTO authors (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [name.trim()]
  );
  return rows[0].id;
}

router.get('/categories', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT c.id, c.name, c.slug, c.parent_id, c.badge, c.sort_order, c.is_visible,
              (SELECT COUNT(*)::int FROM book_categories bc WHERE bc.category_id = c.id) AS product_count
       FROM categories c
       ORDER BY c.sort_order, c.name`
    );
    return res.json({ success: true, data: { categories: rows } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to list categories' });
  }
});

function categorySlug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

/** Validates admin category input. Returns { error } or { values } for the columns provided. */
async function readCategoryInput(body, currentId = null) {
  const values = {};
  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name || name.length > 120) return { error: 'Name is required (max 120 characters)' };
    values.name = name;
  }
  if (body.slug !== undefined) {
    const slug = categorySlug(body.slug);
    if (!slug) return { error: 'Slug may only use letters, numbers and hyphens' };
    values.slug = slug;
  }
  if (body.parentId !== undefined) {
    const parentId = body.parentId === null || body.parentId === '' ? null : Number(body.parentId);
    if (parentId !== null) {
      if (!Number.isInteger(parentId) || parentId === currentId) return { error: 'Invalid parent category' };
      const { rows } = await query(`SELECT parent_id FROM categories WHERE id = $1`, [parentId]);
      if (!rows[0]) return { error: 'Parent category not found' };
      // The storefront renders two levels (category → subcategory).
      if (rows[0].parent_id !== null) return { error: 'Parent must be a top-level category' };
      if (currentId) {
        const kids = await query(`SELECT 1 FROM categories WHERE parent_id = $1 LIMIT 1`, [currentId]);
        if (kids.rows[0]) return { error: 'A category with subcategories cannot be moved under another one' };
      }
    }
    values.parent_id = parentId;
  }
  if (body.badge !== undefined) {
    const badge = String(body.badge || '').trim().toUpperCase().slice(0, 20);
    values.badge = badge || null;
  }
  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder)) return { error: 'Sort order must be a whole number' };
    values.sort_order = sortOrder;
  }
  if (body.isVisible !== undefined) values.is_visible = Boolean(body.isVisible);
  return { values };
}

function categoryWriteError(res, err) {
  if (err?.code === '23505') {
    return res.status(409).json({ success: false, error: 'Another category already uses that slug' });
  }
  console.error(err);
  return res.status(500).json({ success: false, error: 'Could not save category' });
}

router.post('/categories', async (req, res) => {
  try {
    const body = { ...(req.body || {}) };
    if (body.slug === undefined || body.slug === '') body.slug = body.name;
    const { error, values } = await readCategoryInput(body);
    if (error) return res.status(400).json({ success: false, error });
    if (!values.name) return res.status(400).json({ success: false, error: 'Name is required' });
    if (values.sort_order === undefined) {
      const { rows } = await query(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM categories WHERE parent_id IS NOT DISTINCT FROM $1`,
        [values.parent_id ?? null]
      );
      values.sort_order = rows[0].next;
    }
    const cols = Object.keys(values);
    const { rows } = await query(
      `INSERT INTO categories (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING id, name, slug, parent_id, badge, sort_order, is_visible`,
      cols.map((c) => values[c])
    );
    return res.status(201).json({ success: true, data: { category: { ...rows[0], product_count: 0 } } });
  } catch (err) {
    return categoryWriteError(res, err);
  }
});

router.patch('/categories/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'Invalid category id' });
    const { error, values } = await readCategoryInput(req.body || {}, id);
    if (error) return res.status(400).json({ success: false, error });
    const cols = Object.keys(values);
    if (!cols.length) return res.status(400).json({ success: false, error: 'Nothing to update' });
    const { rows } = await query(
      `UPDATE categories SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}
       WHERE id = $${cols.length + 1}
       RETURNING id, name, slug, parent_id, badge, sort_order, is_visible`,
      [...cols.map((c) => values[c]), id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Category not found' });
    return res.json({ success: true, data: { category: rows[0] } });
  } catch (err) {
    return categoryWriteError(res, err);
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'Invalid category id' });
    const kids = await query(`SELECT COUNT(*)::int AS c FROM categories WHERE parent_id = $1`, [id]);
    if (kids.rows[0].c) {
      return res.status(409).json({
        success: false,
        error: 'Move or delete its subcategories first (or hide it instead)',
      });
    }
    const used = await query(`SELECT COUNT(*)::int AS c FROM book_categories WHERE category_id = $1`, [id]);
    if (used.rows[0].c) {
      return res.status(409).json({
        success: false,
        error: `${used.rows[0].c} product(s) use this category — reassign them first or hide it instead`,
      });
    }
    const { rowCount } = await query(`DELETE FROM categories WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ success: false, error: 'Category not found' });
    return res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not delete category' });
  }
});

router.get('/books', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const productType = String(req.query.productType || '').trim();
    const stock = String(req.query.stock || '').trim();
    const status = String(req.query.status || '').trim();
    const categoryId = Number(req.query.categoryId) || 0;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 20));
    const where = [];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      const i = params.length;
      where.push(
        `(b.title ILIKE $${i} OR b.author_name ILIKE $${i} OR COALESCE(b.isbn13,'') ILIKE $${i} OR CAST(b.id AS TEXT) = REPLACE($${i}, '%', ''))`
      );
    }
    if (productType) {
      params.push(productType);
      where.push(`b.product_type = $${params.length}`);
    }
    if (stock === 'in') where.push(`b.stock > 0`);
    if (stock === 'out') where.push(`b.stock <= 0`);
    if (status === 'active') where.push(`b.is_active = TRUE`);
    if (status === 'inactive') where.push(`b.is_active = FALSE`);
    if (categoryId) {
      params.push(categoryId);
      where.push(`EXISTS (SELECT 1 FROM book_categories bc WHERE bc.book_id = b.id AND bc.category_id = $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await query(`SELECT COUNT(*)::int AS c FROM books b ${whereSql}`, params);
    const total = count.rows[0].c;
    params.push(pageSize, (page - 1) * pageSize);
    const { rows } = await query(
      `SELECT b.* FROM books b ${whereSql} ORDER BY b.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const catMap = await categoriesForBooks(rows.map((r) => r.id));
    return res.json({
      success: true,
      data: {
        books: rows.map((b) => mapBook(b, catMap[b.id] || [])),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to list books' });
  }
});

router.get('/books/:id', async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM books WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Product not found' });
    const catMap = await categoriesForBooks([rows[0].id]);
    return res.json({ success: true, data: { book: mapBook(rows[0], catMap[rows[0].id] || []) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to load product' });
  }
});

router.post('/books', async (req, res) => {
  try {
    const body = req.body || {};
    const title = String(body.title || '').trim();
    const authorName = String(body.authorName || '').trim();
    if (!title || !authorName) {
      return res.status(400).json({ success: false, error: 'Title and author are required' });
    }
    const m = Number(body.mrp) || 0;
    const s = Number(body.salePrice) || m;
    if (m < 0 || s < 0 || (m > 0 && s > m)) {
      return res.status(400).json({ success: false, error: 'Sale price must be between 0 and MRP' });
    }
    if (Number(body.stock) < 0) {
      return res.status(400).json({ success: false, error: 'Stock cannot be negative' });
    }
    const sku = optText(body.sku ?? body.isbn13) || null;
    const discount = m > s && m > 0 ? Math.round(((m - s) / m) * 100) : 0;
    const slug = `${slugify(title)}-${Date.now().toString(36)}`;
    const authorId = await upsertAuthor(authorName);
    const { rows } = await query(
      `INSERT INTO books (
         title, slug, author_id, author_name, description, image_url,
         mrp, sale_price, discount_percent, stock, language, publisher, product_type,
         isbn13, isbn10, binding, edition, publishing_date, is_active, is_featured, is_bestseller, sku, cod_allowed
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [
        title,
        slug,
        authorId,
        authorName,
        body.description || null,
        body.imageUrl || '/placeholder-book.svg',
        m,
        s,
        discount,
        Number(body.stock) || 0,
        body.language || 'English',
        body.publisher || 'Salem Book House',
        body.productType || 'book',
        optText(body.isbn13) || sku,
        optText(body.isbn10) || null,
        body.binding || 'Paper Back',
        optText(body.edition) || null,
        optText(body.publishingDate) || null,
        body.isActive !== false,
        Boolean(body.isFeatured),
        Boolean(body.isBestseller),
        sku,
        body.codAllowed !== false,
      ]
    );
    await setBookCategories(rows[0].id, body.categoryIds);
    const catMap = await categoriesForBooks([rows[0].id]);
    return res.status(201).json({ success: true, data: { book: mapBook(rows[0], catMap[rows[0].id] || []) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to create product' });
  }
});

router.patch('/books/:id', async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM books WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Book not found' });
    const b = rows[0];
    const body = req.body || {};
    const title = body.title != null ? String(body.title).trim() : b.title;
    const authorName = body.authorName != null ? String(body.authorName).trim() : b.author_name;
    const authorId = authorName && authorName !== b.author_name ? await upsertAuthor(authorName) : b.author_id;
    const nextMrp = body.mrp != null ? Number(body.mrp) : Number(b.mrp);
    const nextSale = body.salePrice != null ? Number(body.salePrice) : Number(b.sale_price);
    if (
      !Number.isFinite(nextMrp) ||
      !Number.isFinite(nextSale) ||
      nextMrp < 0 ||
      nextSale < 0 ||
      (nextMrp > 0 && nextSale > nextMrp)
    ) {
      return res.status(400).json({ success: false, error: 'Sale price must be between 0 and MRP' });
    }
    if (body.stock != null && !(Number(body.stock) >= 0)) {
      return res.status(400).json({ success: false, error: 'Stock cannot be negative' });
    }
    // Fields the form can blank out: undefined = leave alone, '' = clear.
    const clearable = (v, cur) => (v === undefined ? cur : optText(v) || null);
    const discount = nextMrp > nextSale && nextMrp > 0 ? Math.round(((nextMrp - nextSale) / nextMrp) * 100) : 0;
    const upd = await query(
      `UPDATE books SET
         title = $1,
         author_id = $2,
         author_name = $3,
         description = COALESCE($4, description),
         image_url = COALESCE($5, image_url),
         stock = COALESCE($6, stock),
         mrp = $7,
         sale_price = $8,
         discount_percent = $9,
         is_active = COALESCE($10, is_active),
         language = COALESCE($11, language),
         publisher = COALESCE($12, publisher),
         product_type = COALESCE($13, product_type),
         isbn13 = $14,
         isbn10 = $15,
         binding = COALESCE($16, binding),
         edition = $17,
         publishing_date = $18,
         is_featured = COALESCE($19, is_featured),
         is_bestseller = COALESCE($20, is_bestseller),
         sku = $21,
         cod_allowed = COALESCE($23, cod_allowed)
       WHERE id = $22 RETURNING *`,
      [
        title || b.title,
        authorId,
        authorName || b.author_name,
        body.description !== undefined ? body.description : null,
        body.imageUrl || null,
        body.stock != null ? Number(body.stock) : null,
        nextMrp,
        nextSale,
        discount,
        typeof body.isActive === 'boolean' ? body.isActive : null,
        body.language || null,
        body.publisher || null,
        body.productType || null,
        clearable(body.isbn13 ?? body.sku, b.isbn13),
        clearable(body.isbn10, b.isbn10),
        body.binding || null,
        clearable(body.edition, b.edition),
        clearable(body.publishingDate, b.publishing_date),
        typeof body.isFeatured === 'boolean' ? body.isFeatured : null,
        typeof body.isBestseller === 'boolean' ? body.isBestseller : null,
        clearable(body.sku ?? body.isbn13, b.sku),
        req.params.id,
        typeof body.codAllowed === 'boolean' ? body.codAllowed : null,
      ]
    );
    if (body.categoryIds) await setBookCategories(upd.rows[0].id, body.categoryIds);
    const catMap = await categoriesForBooks([upd.rows[0].id]);
    return res.json({ success: true, data: { book: mapBook(upd.rows[0], catMap[upd.rows[0].id] || []) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to update product' });
  }
});

router.delete('/books/:id', async (req, res) => {
  try {
    const { rows } = await query(`SELECT id FROM books WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Product not found' });
    const sold = await query(`SELECT 1 FROM order_items WHERE book_id = $1 LIMIT 1`, [req.params.id]);
    if (sold.rowCount) {
      // Keep order history intact: hide instead of delete once a product has sold.
      await query(`UPDATE books SET is_active = FALSE WHERE id = $1`, [req.params.id]);
      return res.json({ success: true, data: { id: Number(req.params.id), deleted: false, hidden: true } });
    }
    await query(`DELETE FROM books WHERE id = $1`, [req.params.id]);
    return res.json({ success: true, data: { id: Number(req.params.id), deleted: true } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to delete product' });
  }
});

function mapAdminOrder(o) {
  return {
    id: o.id,
    orderNumber: o.order_number,
    status: o.status,
    subtotal: Number(o.subtotal),
    discount: Number(o.discount),
    shipping: Number(o.shipping),
    total: Number(o.total),
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    shippingName: o.shipping_name,
    shippingPhone: o.shipping_phone,
    shippingAddress: o.shipping_address,
    email: o.user_email || o.guest_email || null,
    couponCode: o.coupon_code,
    giftCardCode: o.gift_card_code,
    awb: o.awb || null,
    courier: o.courier || null,
    trackingUrl: o.tracking_url || null,
    invoiceNumber: o.invoice_number || null,
    itemCount: o.item_count != null ? Number(o.item_count) : undefined,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

/** Orders placed since a timestamp, for the admin's new-order chime. The reply's asOf is the next `since`. */
router.get('/order-alerts', async (req, res) => {
  try {
    const asOf = new Date();
    const since = req.query.since ? new Date(String(req.query.since)) : null;
    if (!since || Number.isNaN(since.getTime())) return res.json({ success: true, data: { asOf: asOf.toISOString(), orders: [] } });
    const { rows } = await query(
      `SELECT id, order_number, total, payment_method, shipping_name, created_at FROM orders
        WHERE created_at > $1 AND created_at <= $2 ORDER BY created_at ASC LIMIT 20`,
      [since, asOf]
    );
    return res.json({
      success: true,
      data: {
        asOf: asOf.toISOString(),
        orders: rows.map((o) => ({ id: o.id, orderNumber: o.order_number, total: Number(o.total), paymentMethod: o.payment_method, customer: o.shipping_name || '' })),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Could not check for new orders' });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
    const where = [];
    const params = [];
    for(const [field,column] of [['payment','o.payment_status'],['courier','o.courier']])if(req.query[field]){params.push(String(req.query[field]));where.push(column+' = $'+params.length);}
    if(req.query.from){params.push(req.query.from);where.push('o.created_at >= $'+params.length+'::date');}
    if(req.query.to){params.push(req.query.to);where.push('o.created_at < $'+params.length+"::date + INTERVAL '1 day'");}

    if (q) {
      params.push(`%${q}%`);
      const i = params.length;
      where.push(
        `(o.order_number ILIKE $${i} OR o.shipping_name ILIKE $${i} OR o.shipping_phone ILIKE $${i}
          OR COALESCE(u.email, o.guest_email, '') ILIKE $${i})`
      );
    }
    if (status && ORDER_STATUSES.includes(status)) {
      params.push(status);
      where.push(`o.status = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await query(
      `SELECT COUNT(*)::int AS c FROM orders o LEFT JOIN users u ON u.id = o.user_id ${whereSql}`,
      params
    );
    const total = count.rows[0].c;
    params.push(pageSize, (page - 1) * pageSize);
    const { rows } = await query(
      `SELECT o.*, u.email AS user_email,
              (SELECT COALESCE(SUM(quantity),0) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       ${whereSql}
       ORDER BY o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.json({
      success: true,
      data: {
        orders: rows.map(mapAdminOrder),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to list orders' });
  }
});

async function loadAdminOrder(id) {
  const { rows } = await query(
    `SELECT o.*, u.email AS user_email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const [items, events] = await Promise.all([
    query(`SELECT * FROM order_items WHERE order_id = $1`, [id]),
    query(`SELECT status, note, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at`, [id]),
  ]);
  return {
    ...mapAdminOrder(rows[0]),
    items: items.rows.map((it) => ({
      id: it.id,
      bookId: it.book_id,
      title: it.title,
      authorName: it.author_name,
      imageUrl: it.image_url,
      unitPrice: Number(it.unit_price),
      quantity: it.quantity,
      lineTotal: Number(it.line_total),
    })),
    events: events.rows.map((e) => ({ status: e.status, note: e.note, createdAt: e.created_at })),
  };
}

router.get('/orders/:id', async (req, res) => {
  try {
    const order = await loadAdminOrder(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    return res.json({ success: true, data: { order } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to load order' });
  }
});

router.patch('/orders/:id', async (req, res) => {
  const status = String(req.body?.status || '').toLowerCase();
  const requestedPayment = req.body?.paymentStatus ? String(req.body.paymentStatus).toLowerCase() : null;
  if (!status && !requestedPayment) {
    return res.status(400).json({ success: false, error: 'Nothing to update' });
  }
  if (status && !ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }
  if (requestedPayment && !['pending', 'paid', 'refunded', 'cancelled'].includes(requestedPayment)) {
    return res.status(400).json({ success: false, error: 'Invalid payment status' });
  }
  const client = await (await getPool()).connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const order = cur.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    if(req.user.role!=='admin' && ['cancelled','returned'].includes(status) && order.payment_status==='paid' && !req.permissions.includes('refunds'))throw new Error('Refund permission is required to cancel or return a paid order');
    await transitionOrder(client,order,status || order.status,{actor:req.user,note:String(req.body?.note || '').slice(0,1000),paymentStatus:requestedPayment});
    await client.query('COMMIT');
    return res.json({ success: true, data: { order: await loadAdminOrder(order.id) } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(400).json({ success: false, error: err.message || 'Failed to update order' });
  } finally {
    client.release();
  }
});

router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'Choose an image file (max 4 MB)' });
  const { rows } = await query(`INSERT INTO media (filename, mime, data) VALUES ($1,$2,$3) RETURNING id`, [
    path.basename(req.file.originalname || 'upload').slice(0, 200),
    req.file.mimetype,
    req.file.buffer,
  ]);
  return res.json({ success: true, data: { url: `/uploads/media/${rows[0].id}` } });
});

router.get('/banners', async (_req, res) => {
  const { rows } = await query(`SELECT * FROM banners ORDER BY sort_order, id`);
  return res.json({
    success: true,
    data: {
      banners: rows.map((b) => ({
        id: b.id,
        title: b.title,
        subtitle: b.subtitle,
        cta: b.cta,
        link: b.link,
        imageUrl: b.image_url,
        isActive: b.is_active,
        sortOrder: b.sort_order,
      })),
    },
  });
});

router.post('/banners', async (req, res) => {
  const { title, subtitle, cta, link, imageUrl, sortOrder } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ success: false, error: 'Title is required' });
  const { rows } = await query(
    `INSERT INTO banners (title, subtitle, cta, link, image_url, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [title.trim(), subtitle || null, cta || 'Shop', (link ? safeLink(link) : '/shop') || '/shop', imageUrl || null, Number(sortOrder) || 0]
  );
  return res.status(201).json({ success: true, data: { id: rows[0].id } });
});

router.patch('/banners/:id', async (req, res) => {
  const { title, subtitle, cta, link, imageUrl, isActive, sortOrder } = req.body || {};
  await query(
    `UPDATE banners SET
       title = COALESCE($1, title),
       subtitle = COALESCE($2, subtitle),
       cta = COALESCE($3, cta),
       link = COALESCE($4, link),
       image_url = COALESCE($5, image_url),
       is_active = COALESCE($6, is_active),
       sort_order = COALESCE($7, sort_order)
     WHERE id = $8`,
    [
      title || null,
      subtitle || null,
      cta || null,
      link ? safeLink(link) : null,
      imageUrl || null,
      typeof isActive === 'boolean' ? isActive : null,
      sortOrder != null ? Number(sortOrder) : null,
      req.params.id,
    ]
  );
  return res.json({ success: true, data: { id: Number(req.params.id) } });
});

router.delete('/banners/:id', async (req, res) => {
  const { rowCount } = await query(`DELETE FROM banners WHERE id = $1`, [req.params.id]);
  if (!rowCount) return res.status(404).json({ success: false, error: 'Banner not found' });
  return res.json({ success: true, data: { id: Number(req.params.id) } });
});

router.get('/pages', async (_req, res) => {
  const { rows } = await query(`SELECT slug, title, body, updated_at FROM cms_pages ORDER BY slug`);
  return res.json({
    success: true,
    data: {
      pages: rows.map((p) => ({
        slug: p.slug,
        title: p.title,
        body: p.body,
        updatedAt: p.updated_at,
      })),
    },
  });
});

router.put('/pages/:slug', async (req, res) => {
  const { title, body } = req.body || {};
  if (!/^[a-z0-9-]{1,80}$/.test(req.params.slug)) {
    return res.status(400).json({ success: false, error: 'Slug may contain only a-z, 0-9 and dashes' });
  }
  if (!title || !body) return res.status(400).json({ success: false, error: 'Title and body are required' });
  await query(
    `INSERT INTO cms_pages (slug, title, body, updated_at) VALUES ($1,$2,$3,NOW())
     ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, updated_at = NOW()`,
    [req.params.slug, title, body]
  );
  return res.json({ success: true, data: { slug: req.params.slug } });
});

function limitOrNull(v) {
  const n = Math.floor(Number(v));
  return v === '' || v == null || !Number.isFinite(n) || n < 1 ? null : n;
}

router.get('/coupons', async (_req, res) => {
  const { rows } = await query(
    `SELECT c.*, (
       SELECT COUNT(*)::int FROM orders o
       WHERE UPPER(o.coupon_code) = UPPER(c.code) AND o.status NOT IN ('cancelled','returned')
     ) AS used
     FROM coupons c ORDER BY c.code`
  );
  return res.json({
    success: true,
    data: {
      coupons: rows.map((c) => ({
        id: c.id,
        code: c.code,
        description: c.description,
        percentOff: c.percent_off,
        amountOff: Number(c.amount_off),
        minOrder: Number(c.min_order),
        active: c.active,
        expiresAt: c.expires_at,
        usageLimit: c.usage_limit,
        perCustomerLimit: c.per_customer_limit,
        used: c.used,
      })),
    },
  });
});

router.post('/coupons', async (req, res) => {
  const { code, description, percentOff, amountOff, minOrder, expiresAt, usageLimit, perCustomerLimit } = req.body || {};
  if (!code?.trim()) return res.status(400).json({ success: false, error: 'Code is required' });
  const pct = Number(percentOff) || 0;
  const amt = Number(amountOff) || 0;
  if (pct < 0 || pct > 100 || amt < 0 || (!pct && !amt)) {
    return res.status(400).json({ success: false, error: 'Give a % off between 1 and 100, or a flat amount off' });
  }
  await query(
    `INSERT INTO coupons (code, description, percent_off, amount_off, min_order, expires_at, usage_limit, per_customer_limit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (code) DO UPDATE SET
       description = EXCLUDED.description,
       percent_off = EXCLUDED.percent_off,
       amount_off = EXCLUDED.amount_off,
       min_order = EXCLUDED.min_order,
       expires_at = EXCLUDED.expires_at,
       usage_limit = EXCLUDED.usage_limit,
       per_customer_limit = EXCLUDED.per_customer_limit,
       active = TRUE`,
    [
      code.trim().toUpperCase(),
      description || null,
      pct,
      pct ? 0 : amt,
      Number(minOrder) || 0,
      expiresAt || null,
      limitOrNull(usageLimit),
      limitOrNull(perCustomerLimit),
    ]
  );
  return res.status(201).json({ success: true, data: { code: code.trim().toUpperCase() } });
});

router.patch('/coupons/:id', async (req, res) => {
  const { active, percentOff, amountOff, minOrder, description, expiresAt, code, usageLimit, perCustomerLimit } = req.body || {};
  const { rows } = await query(`SELECT * FROM coupons WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ success: false, error: 'Coupon not found' });
  const cur = rows[0];
  const pct = percentOff != null ? Number(percentOff) : cur.percent_off;
  const amt = amountOff != null ? Number(amountOff) : Number(cur.amount_off);
  await query(
    `UPDATE coupons SET
       code = COALESCE($1, code),
       description = COALESCE($2, description),
       percent_off = $3,
       amount_off = $4,
       min_order = COALESCE($5, min_order),
       expires_at = COALESCE($6, expires_at),
       active = COALESCE($7, active),
       usage_limit = CASE WHEN $9::boolean THEN $10::int ELSE usage_limit END,
       per_customer_limit = CASE WHEN $11::boolean THEN $12::int ELSE per_customer_limit END
     WHERE id = $8`,
    [
      code ? String(code).trim().toUpperCase() : null,
      description !== undefined ? description : null,
      Number(pct) || 0,
      Number(pct) ? 0 : Number(amt) || 0,
      minOrder != null ? Number(minOrder) : null,
      expiresAt !== undefined ? expiresAt : null,
      typeof active === 'boolean' ? active : null,
      req.params.id,
      usageLimit !== undefined,
      limitOrNull(usageLimit),
      perCustomerLimit !== undefined,
      limitOrNull(perCustomerLimit),
    ]
  );
  return res.json({ success: true, data: { id: Number(req.params.id) } });
});

router.delete('/coupons/:id', async (req, res) => {
  const { rowCount } = await query(`DELETE FROM coupons WHERE id = $1`, [req.params.id]);
  if (!rowCount) return res.status(404).json({ success: false, error: 'Coupon not found' });
  return res.json({ success: true, data: { id: Number(req.params.id) } });
});

router.get('/customers', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const params = [];
  let where = '';
  if (q) {
    params.push(`%${q}%`);
    where = `WHERE u.name ILIKE $1 OR u.email ILIKE $1 OR COALESCE(u.phone,'') ILIKE $1`;
  }
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
            COUNT(o.id)::int AS order_count,
            COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelled','returned')),0)::numeric AS spent
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.id
     ${where}
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT 200`,
    params
  );
  return res.json({
    success: true,
    data: {
      customers: rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        createdAt: u.created_at,
        orderCount: u.order_count,
        spent: Number(u.spent),
      })),
    },
  });
});

const STAFF_ROLES = ['admin', 'staff'];

function publicStaff(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    staffRoleId: u.staff_role_id ?? null,
    staffRoleName: u.staff_role_name ?? null,
    createdAt: u.created_at,
  };
}

const STAFF_SELECT = `SELECT u.id, u.name, u.email, u.role, u.staff_role_id, r.name AS staff_role_name, u.created_at
  FROM users u LEFT JOIN staff_roles r ON r.id = u.staff_role_id`;

/** Resolves { role, staffRoleId } from a request body, or returns { error }. */
async function readAccess(body) {
  const role = STAFF_ROLES.includes(body?.role) ? body.role : 'staff';
  if (role === 'admin') return { role, staffRoleId: null };
  const staffRoleId = Number(body?.staffRoleId);
  if (!Number.isInteger(staffRoleId)) return { error: 'Choose a role for this staff member' };
  const { rows } = await query(`SELECT 1 FROM staff_roles WHERE id = $1`, [staffRoleId]);
  if (!rows[0]) return { error: 'That role no longer exists' };
  return { role, staffRoleId };
}

async function otherAdminsExist(userId) {
  const { rows } = await query(`SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin' AND id <> $1`, [userId]);
  return rows[0].c > 0;
}

router.get('/staff', async (_req, res) => {
  const { rows } = await query(`${STAFF_SELECT} WHERE u.role = ANY($1) ORDER BY u.role, u.created_at`, [
    STAFF_ROLES,
  ]);
  return res.json({ success: true, data: { staff: rows.map(publicStaff) } });
});

router.post('/staff', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const access = await readAccess(req.body);
    if (access.error) return res.status(400).json({ success: false, error: access.error });
    if (!name || name.length > 120) return res.status(400).json({ success: false, error: 'Name is required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Enter a valid email address' });
    }
    if (checks.password(password)) {
      return res.status(400).json({ success: false, error: checks.password(password) });
    }
    const existing = await query(`SELECT role FROM users WHERE lower(email) = $1`, [email]);
    if (existing.rows[0]) {
      return res.status(409).json({
        success: false,
        error: STAFF_ROLES.includes(existing.rows[0].role)
          ? 'This email already has portal access'
          : 'This email already has a customer account — use a different email for staff',
      });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [name, email, hash, access.role, access.staffRoleId]
    );
    const created = await query(`${STAFF_SELECT} WHERE u.id = $1`, [rows[0].id]);
    return res.status(201).json({ success: true, data: { staff: publicStaff(created.rows[0]) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not add staff member' });
  }
});

/** Changes a member's access: admin (full) or staff with a given role. */
router.patch('/staff/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ success: false, error: 'You cannot change your own access' });
    }
    const { rows } = await query(`SELECT role FROM users WHERE id = $1`, [req.params.id]);
    if (!rows[0] || !STAFF_ROLES.includes(rows[0].role)) {
      return res.status(404).json({ success: false, error: 'Staff member not found' });
    }
    const access = await readAccess(req.body);
    if (access.error) return res.status(400).json({ success: false, error: access.error });
    if (rows[0].role === 'admin' && access.role !== 'admin' && !(await otherAdminsExist(req.params.id))) {
      return res.status(400).json({ success: false, error: 'At least one admin must remain' });
    }
    await query(`UPDATE users SET role = $1, staff_role_id = $2 WHERE id = $3`, [
      access.role,
      access.staffRoleId,
      req.params.id,
    ]);
    const updated = await query(`${STAFF_SELECT} WHERE u.id = $1`, [req.params.id]);
    return res.json({ success: true, data: { staff: publicStaff(updated.rows[0]) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not update access' });
  }
});

router.patch('/staff/:id/password', async (req, res) => {
  try {
    const password = String(req.body?.password || '');
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rowCount } = await query(
      `UPDATE users SET password_hash = $1 WHERE id = $2 AND role = ANY($3)`,
      [hash, req.params.id, STAFF_ROLES]
    );
    if (!rowCount) return res.status(404).json({ success: false, error: 'Staff member not found' });
    return res.json({ success: true, data: { updated: true } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not reset password' });
  }
});

/** Removes portal access (the account becomes a normal customer); never deletes order history. */
router.delete('/staff/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ success: false, error: 'You cannot remove your own access' });
    }
    const { rows } = await query(`SELECT role FROM users WHERE id = $1`, [req.params.id]);
    if (!rows[0] || !STAFF_ROLES.includes(rows[0].role)) {
      return res.status(404).json({ success: false, error: 'Staff member not found' });
    }
    if (rows[0].role === 'admin' && !(await otherAdminsExist(req.params.id))) {
      return res.status(400).json({ success: false, error: 'At least one admin must remain' });
    }
    await query(`UPDATE users SET role = 'customer', staff_role_id = NULL WHERE id = $1`, [req.params.id]);
    return res.json({ success: true, data: { removed: true } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not remove access' });
  }
});

function readRoleInput(body, partial = false) {
  const values = {};
  if (!partial || body?.name !== undefined) {
    const name = String(body?.name || '').trim();
    if (!name || name.length > 80) return { error: 'Role name is required (max 80 characters)' };
    values.name = name;
  }
  if (!partial || body?.permissions !== undefined) {
    const list = Array.isArray(body?.permissions) ? body.permissions : [];
    const permissions = ADMIN_MODULES.filter((m) => list.includes(m));
    if (!permissions.length) return { error: 'Give the role access to at least one section' };
    values.permissions = permissions;
  }
  return { values };
}

function roleWriteError(res, err) {
  if (err?.code === '23505') {
    return res.status(409).json({ success: false, error: 'A role with that name already exists' });
  }
  console.error(err);
  return res.status(500).json({ success: false, error: 'Could not save role' });
}

router.get('/roles', async (_req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.name, r.permissions,
            (SELECT COUNT(*)::int FROM users u WHERE u.staff_role_id = r.id AND u.role = 'staff') AS member_count
     FROM staff_roles r ORDER BY r.name`
  );
  return res.json({
    success: true,
    data: {
      modules: ADMIN_MODULES,
      roles: rows.map((r) => ({
        id: r.id,
        name: r.name,
        permissions: r.permissions,
        memberCount: r.member_count,
      })),
    },
  });
});

router.post('/roles', async (req, res) => {
  try {
    const { error, values } = readRoleInput(req.body);
    if (error) return res.status(400).json({ success: false, error });
    const { rows } = await query(
      `INSERT INTO staff_roles (name, permissions) VALUES ($1, $2) RETURNING id, name, permissions`,
      [values.name, values.permissions]
    );
    return res.status(201).json({ success: true, data: { role: { ...rows[0], memberCount: 0 } } });
  } catch (err) {
    return roleWriteError(res, err);
  }
});

router.patch('/roles/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'Invalid role id' });
    const { error, values } = readRoleInput(req.body, true);
    if (error) return res.status(400).json({ success: false, error });
    const cols = Object.keys(values);
    if (!cols.length) return res.status(400).json({ success: false, error: 'Nothing to update' });
    const { rows } = await query(
      `UPDATE staff_roles SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}
       WHERE id = $${cols.length + 1} RETURNING id, name, permissions`,
      [...cols.map((c) => values[c]), id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Role not found' });
    return res.json({ success: true, data: { role: rows[0] } });
  } catch (err) {
    return roleWriteError(res, err);
  }
});

router.delete('/roles/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'Invalid role id' });
    const used = await query(`SELECT COUNT(*)::int AS c FROM users WHERE staff_role_id = $1 AND role = 'staff'`, [id]);
    if (used.rows[0].c) {
      return res.status(409).json({
        success: false,
        error: `${used.rows[0].c} staff member(s) have this role — give them another role first`,
      });
    }
    const { rowCount } = await query(`DELETE FROM staff_roles WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ success: false, error: 'Role not found' });
    return res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not delete role' });
  }
});

router.get('/emails', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, to_email, subject, body, sent, error, created_at FROM email_outbox ORDER BY created_at DESC LIMIT 50`
  );
  return res.json({
    success: true,
    data: {
      emails: rows.map((e) => ({
        id: e.id,
        to: e.to_email,
        subject: e.subject,
        body: e.body,
        sent: e.sent,
        error: e.error,
        createdAt: e.created_at,
      })),
    },
  });
});

router.get('/erp/status', (_req, res) => {
  return res.json({
    success: true,
    data: {
      configured: isErpConfigured(),
      lastSync: lastErpSync(),
      host: process.env.ERP_API_URL || process.env.ERP_MCP_URL || 'https://muruga-api-bjmm.onrender.com',
    },
  });
});

router.post('/erp/sync', async (_req, res) => {
  try {
    const result = await syncErpProducts();
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ success: false, error: err.message || 'ERP sync failed' });
  }
});

router.post('/covers/backfill', async (_req, res) => {
  try {
    const { backfillCovers } = await import('../scripts/backfillCovers.js');
    const stats = await backfillCovers();
    return res.json({ success: true, data: stats });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ success: false, error: err.message || 'Cover backfill failed' });
  }
});

export default router;
