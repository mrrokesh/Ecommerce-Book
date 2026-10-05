import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { query } from '../db/pool.js';
import { requireAdmin } from '../middleware/auth.js';
import { mapBook } from '../utils/bookMapper.js';

const router = Router();
router.use(requireAdmin);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '../../uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 8) || '.bin';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 4 * 1024 * 1024 } });

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

router.get('/summary', async (_req, res) => {
  try {
    const [books, orders, users, revenue] = await Promise.all([
      query(`SELECT COUNT(*)::int AS c FROM books`),
      query(`SELECT COUNT(*)::int AS c FROM orders`),
      query(`SELECT COUNT(*)::int AS c FROM users`),
      query(`SELECT COALESCE(SUM(total),0)::numeric AS s FROM orders WHERE status <> 'cancelled'`),
    ]);
    const recent = await query(
      `SELECT id, order_number, status, total, payment_method, created_at
       FROM orders ORDER BY created_at DESC LIMIT 12`
    );
    return res.json({
      success: true,
      data: {
        stats: {
          books: books.rows[0].c,
          orders: orders.rows[0].c,
          users: users.rows[0].c,
          revenue: Number(revenue.rows[0].s),
        },
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
    const { rows } = await query(`SELECT id, name, slug, parent_id FROM categories ORDER BY sort_order, name`);
    return res.json({ success: true, data: { categories: rows } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to list categories' });
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
    const discount = m > s && m > 0 ? Math.round(((m - s) / m) * 100) : 0;
    const slug = `${slugify(title)}-${Date.now().toString(36)}`;
    const authorId = await upsertAuthor(authorName);
    const { rows } = await query(
      `INSERT INTO books (
         title, slug, author_id, author_name, description, image_url,
         mrp, sale_price, discount_percent, stock, language, publisher, product_type,
         isbn13, isbn10, binding, edition, publishing_date, is_active, is_featured, is_bestseller
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
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
        body.isbn13 || body.sku || null,
        body.isbn10 || null,
        body.binding || 'Paper Back',
        body.edition || null,
        body.publishingDate || null,
        body.isActive !== false,
        Boolean(body.isFeatured),
        Boolean(body.isBestseller),
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
         isbn13 = COALESCE($14, isbn13),
         isbn10 = COALESCE($15, isbn10),
         binding = COALESCE($16, binding),
         edition = COALESCE($17, edition),
         publishing_date = COALESCE($18, publishing_date),
         is_featured = COALESCE($19, is_featured),
         is_bestseller = COALESCE($20, is_bestseller)
       WHERE id = $21 RETURNING *`,
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
        body.isbn13 || body.sku || null,
        body.isbn10 || null,
        body.binding || null,
        body.edition || null,
        body.publishingDate || null,
        typeof body.isFeatured === 'boolean' ? body.isFeatured : null,
        typeof body.isBestseller === 'boolean' ? body.isBestseller : null,
        req.params.id,
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

router.get('/orders', async (_req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 100`);
    return res.json({
      success: true,
      data: {
        orders: rows.map((o) => ({
          id: o.id,
          orderNumber: o.order_number,
          status: o.status,
          total: Number(o.total),
          paymentMethod: o.payment_method,
          paymentStatus: o.payment_status,
          shippingName: o.shipping_name,
          createdAt: o.created_at,
        })),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to list orders' });
  }
});

router.patch('/orders/:id', async (req, res) => {
  try {
    const status = String(req.body?.status || '').toLowerCase();
    const allowed = [
      'placed',
      'confirmed',
      'packed',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'return_requested',
      'returned',
    ];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    const { rows } = await query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Order not found' });
    await query(`INSERT INTO order_events (order_id, status, note) VALUES ($1,$2,$3)`, [
      rows[0].id,
      status,
      req.body?.note || `Status updated to ${status}`,
    ]);
    return res.json({
      success: true,
      data: { id: rows[0].id, status: rows[0].status },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to update order' });
  }
});

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  return res.json({ success: true, data: { url: `/uploads/${req.file.filename}` } });
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
    [title.trim(), subtitle || null, cta || 'Shop', link || '/shop', imageUrl || null, Number(sortOrder) || 0]
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
      link || null,
      imageUrl || null,
      typeof isActive === 'boolean' ? isActive : null,
      sortOrder != null ? Number(sortOrder) : null,
      req.params.id,
    ]
  );
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
  if (!title || !body) return res.status(400).json({ success: false, error: 'Title and body are required' });
  await query(
    `INSERT INTO cms_pages (slug, title, body, updated_at) VALUES ($1,$2,$3,NOW())
     ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, updated_at = NOW()`,
    [req.params.slug, title, body]
  );
  return res.json({ success: true, data: { slug: req.params.slug } });
});

router.get('/coupons', async (_req, res) => {
  const { rows } = await query(`SELECT * FROM coupons ORDER BY code`);
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
      })),
    },
  });
});

router.post('/coupons', async (req, res) => {
  const { code, description, percentOff, amountOff, minOrder } = req.body || {};
  if (!code?.trim()) return res.status(400).json({ success: false, error: 'Code is required' });
  await query(
    `INSERT INTO coupons (code, description, percent_off, amount_off, min_order)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (code) DO UPDATE SET
       description = EXCLUDED.description,
       percent_off = EXCLUDED.percent_off,
       amount_off = EXCLUDED.amount_off,
       min_order = EXCLUDED.min_order,
       active = TRUE`,
    [
      code.trim().toUpperCase(),
      description || null,
      Number(percentOff) || 0,
      Number(amountOff) || 0,
      Number(minOrder) || 0,
    ]
  );
  return res.status(201).json({ success: true, data: { code: code.trim().toUpperCase() } });
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

export default router;
