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

router.get('/books', async (_req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM books ORDER BY id DESC LIMIT 200`);
    return res.json({ success: true, data: { books: rows.map((b) => mapBook(b)) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to list books' });
  }
});

router.post('/books', async (req, res) => {
  try {
    const { title, authorName, mrp, salePrice, stock, language, publisher, description, imageUrl, productType } =
      req.body || {};
    if (!title?.trim() || !authorName?.trim()) {
      return res.status(400).json({ success: false, error: 'Title and author are required' });
    }
    const m = Number(mrp) || 0;
    const s = Number(salePrice) || m;
    const discount = m > s && m > 0 ? Math.round(((m - s) / m) * 100) : 0;
    const slug = `${slugify(title)}-${Date.now().toString(36)}`;
    const authorRes = await query(
      `INSERT INTO authors (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [authorName.trim()]
    );
    const { rows } = await query(
      `INSERT INTO books (
         title, slug, author_id, author_name, description, image_url,
         mrp, sale_price, discount_percent, stock, language, publisher, product_type
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        title.trim(),
        slug,
        authorRes.rows[0].id,
        authorName.trim(),
        description || null,
        imageUrl || '/placeholder-book.svg',
        m,
        s,
        discount,
        Number(stock) || 0,
        language || 'English',
        publisher || 'Salem Book House',
        productType || 'book',
      ]
    );
    return res.status(201).json({ success: true, data: { book: mapBook(rows[0]) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to create product' });
  }
});

router.patch('/books/:id', async (req, res) => {
  try {
    const { title, stock, mrp, salePrice, isActive } = req.body || {};
    const { rows } = await query(`SELECT * FROM books WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Book not found' });
    const b = rows[0];
    const nextMrp = mrp != null ? Number(mrp) : Number(b.mrp);
    const nextSale = salePrice != null ? Number(salePrice) : Number(b.sale_price);
    const discount = nextMrp > nextSale && nextMrp > 0 ? Math.round(((nextMrp - nextSale) / nextMrp) * 100) : 0;
    const upd = await query(
      `UPDATE books SET
         title = COALESCE($1, title),
         stock = COALESCE($2, stock),
         mrp = $3,
         sale_price = $4,
         discount_percent = $5,
         is_active = COALESCE($6, is_active)
       WHERE id = $7 RETURNING *`,
      [
        title || null,
        stock != null ? Number(stock) : null,
        nextMrp,
        nextSale,
        discount,
        typeof isActive === 'boolean' ? isActive : null,
        req.params.id,
      ]
    );
    return res.json({ success: true, data: { book: mapBook(upd.rows[0]) } });
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
