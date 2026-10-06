import { query } from '../db/pool.js';
import { fetchErpProducts, isErpConfigured } from './mcp.js';

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function pick(obj, keys, fallback = '') {
  for (const key of keys) {
    const v = obj?.[key];
    if (v != null && String(v).trim() !== '') return v;
  }
  return fallback;
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function attachCategory(bookId, slug) {
  if (!bookId || !slug) return;
  const { rows } = await query(`SELECT id FROM categories WHERE slug = $1`, [slug]);
  if (!rows[0]) return;
  await query(
    `INSERT INTO book_categories (book_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [bookId, rows[0].id]
  );
}

async function upsertAuthor(name) {
  const { rows } = await query(
    `INSERT INTO authors (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [name]
  );
  return rows[0].id;
}

export function mapErpProduct(raw) {
  const title = String(pick(raw, ['name', 'title', 'product_name', 'productName', 'item_name'], '')).trim();
  const sku = String(pick(raw, ['sku', 'barcode', 'item_code', 'code', 'hsn'], '')).trim();
  const erpId = String(pick(raw, ['id', '_id', 'product_id', 'uuid'], sku || title)).trim();
  const mrp = num(pick(raw, ['mrp', 'compare_price', 'max_price', 'price_mrp', 'list_price'], 0));
  const sale = num(pick(raw, ['effective_price', 'price', 'selling_price', 'sale_price', 'unit_price'], mrp));
  const stock = num(pick(raw, ['stock_quantity', 'stock', 'qty', 'quantity', 'available_qty'], 0));
  const rawImage = String(
    pick(raw, ['cover_image', 'image', 'image_url', 'imageUrl', 'photo', 'thumbnail', 'cover'], '')
  );
  const image = /sapna/i.test(rawImage) ? '/placeholder-book.svg' : rawImage || '/placeholder-book.svg';
  const description = String(pick(raw, ['description', 'short_description', 'details', 'notes'], '') || '');
  const authorName = String(pick(raw, ['brand', 'author', 'author_name', 'manufacturer'], 'Salem Book House'));
  const publisher = String(pick(raw, ['publisher', 'brand', 'vendor'], 'Salem Book House'));
  const categorySlug = String(pick(raw, ['category_slug', 'categorySlug'], '')).trim();
  return {
    erpId,
    title,
    sku: sku.slice(0, 80),
    isbn13: sku.replace(/\D/g, '').slice(0, 13) || null,
    mrp: mrp || sale,
    salePrice: sale || mrp,
    stock,
    imageUrl: image,
    description,
    authorName,
    publisher,
    categorySlug,
    active: raw.active !== false && raw.is_active !== false && raw.status !== 'inactive',
  };
}

let lastSync = null;
let running = null;

export function lastErpSync() {
  return lastSync;
}

/** Runs one sync at a time; concurrent callers share the in-flight run. */
export function syncErpProducts() {
  if (!running) {
    running = runSync()
      .then((result) => {
        lastSync = { at: new Date().toISOString(), ok: true, ...result, tools: undefined };
        return result;
      })
      .catch((err) => {
        lastSync = { at: new Date().toISOString(), ok: false, error: err.message || String(err) };
        throw err;
      })
      .finally(() => {
        running = null;
      });
  }
  return running;
}

/** Pull ERP products every ERP_SYNC_MINUTES (default 15) so stock/prices stay current without clicking Sync. */
export function startErpAutoSync() {
  if (!isErpConfigured()) return;
  const minutes = Number(process.env.ERP_SYNC_MINUTES ?? 15);
  if (!(minutes > 0)) return;
  const tick = () =>
    syncErpProducts()
      .then((r) => console.log(`ERP sync: ${r.upserted} products upserted`))
      .catch((err) => console.warn('ERP sync failed:', err.message || err));
  setTimeout(tick, 120_000).unref();
  setInterval(tick, minutes * 60_000).unref();
}

async function runSync() {
  if (!isErpConfigured()) {
    throw new Error('Set ERP_API_KEY (store key, header X-Api-Key)');
  }
  const { tool, tools, products } = await fetchErpProducts();
  let upserted = 0;
  let skipped = 0;
  for (const raw of products) {
    const p = mapErpProduct(raw);
    if (!p.title || !p.erpId) {
      skipped += 1;
      continue;
    }
    const authorId = await upsertAuthor(p.authorName);
    const discount =
      p.mrp > p.salePrice && p.mrp > 0 ? Math.round(((p.mrp - p.salePrice) / p.mrp) * 100) : 0;
    const existing = await query(`SELECT id, slug FROM books WHERE erp_id = $1`, [p.erpId]);
    let bookId;
    if (existing.rows[0]) {
      bookId = existing.rows[0].id;
      await query(
        `UPDATE books SET
           title = $1, author_id = $2, author_name = $3, sku = $4, isbn13 = COALESCE($5, isbn13),
           description = COALESCE(NULLIF($6,''), description), image_url = $7,
           mrp = $8, sale_price = $9, discount_percent = $10, stock = $11, publisher = $12,
           is_active = $13, product_type = COALESCE(product_type, 'book')
         WHERE id = $14`,
        [
          p.title,
          authorId,
          p.authorName,
          p.sku || null,
          p.isbn13,
          p.description,
          p.imageUrl,
          p.mrp,
          p.salePrice,
          discount,
          p.stock,
          p.publisher,
          p.active,
          bookId,
        ]
      );
    } else {
      const slug = `${slugify(p.title) || 'product'}-${Date.now().toString(36)}${upserted}`;
      const inserted = await query(
        `INSERT INTO books (
           title, slug, author_id, author_name, sku, isbn13, description, image_url,
           mrp, sale_price, discount_percent, stock, publisher, product_type, is_active, erp_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'book',$14,$15)
         RETURNING id`,
        [
          p.title,
          slug,
          authorId,
          p.authorName,
          p.sku || null,
          p.isbn13,
          p.description || null,
          p.imageUrl,
          p.mrp,
          p.salePrice,
          discount,
          p.stock,
          p.publisher,
          p.active,
          p.erpId,
        ]
      );
      bookId = inserted.rows[0].id;
    }
    await attachCategory(bookId, p.categorySlug);
    upserted += 1;
  }
  return { tool, tools, fetched: products.length, upserted, skipped };
}
