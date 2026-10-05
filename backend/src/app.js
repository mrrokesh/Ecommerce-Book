import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import booksRoutes from './routes/books.js';
import categoriesRoutes from './routes/categories.js';
import homeRoutes from './routes/home.js';
import cartRoutes from './routes/cart.js';
import ordersRoutes from './routes/orders.js';
import wishlistRoutes from './routes/wishlist.js';
import reviewsRoutes from './routes/reviews.js';
import authorsRoutes from './routes/authors.js';
import publishersRoutes from './routes/publishers.js';
import storesRoutes from './routes/stores.js';
import pincodeRoutes from './routes/pincode.js';
import examsRoutes from './routes/exams.js';
import addressesRoutes from './routes/addresses.js';
import pagesRoutes from './routes/pages.js';
import adminRoutes from './routes/admin.js';
import paymentsRoutes from './routes/payments.js';
import couponsRoutes from './routes/coupons.js';
import { query } from './db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const origins = String(process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || origins.includes(origin) || origins.includes('*')) return cb(null, true);
      try {
        const host = new URL(origin).hostname;
        if (host.endsWith('.vercel.app')) return cb(null, true);
      } catch {
        /* ignore */
      }
      return cb(null, origins[0] || true);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

const uploadsDir = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.get('/uploads/media/:id', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).end();
  const { rows } = await query(`SELECT mime, data FROM media WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).end();
  res.set('Content-Type', rows[0].mime);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  return res.send(rows[0].data);
});
app.use('/uploads', express.static(uploadsDir));

app.get('/api/covers/:file', async (req, res) => {
  const { renderCoverSvg } = await import('./utils/covers.js');
  const slug = String(req.params.file || '').replace(/\.svg$/i, '');
  if (!slug) return res.status(404).end();
  const title = slug.replace(/-/g, ' ');
  res.set('Content-Type', 'image/svg+xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=604800, immutable');
  return res.send(renderCoverSvg(title, slug));
});

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      brand: 'Salem Book House',
      tagline: "Salem's Favourite Book Mall",
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/authors', authorsRoutes);
app.use('/api/publishers', publishersRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/pincode', pincodeRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/addresses', addressesRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/coupons', couponsRoutes);

const distDir = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api)(?!\/uploads).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

export default app;
