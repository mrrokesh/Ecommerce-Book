import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { getPool, query } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = [
  `ALTER TABLE books ADD COLUMN IF NOT EXISTS binding VARCHAR(60) DEFAULT 'Paper Back'`,
  `ALTER TABLE books ADD COLUMN IF NOT EXISTS publishing_date VARCHAR(40)`,
  `ALTER TABLE books ADD COLUMN IF NOT EXISTS edition VARCHAR(40)`,
  `ALTER TABLE books ADD COLUMN IF NOT EXISTS is_bestseller BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id INT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewer_name VARCHAR(120) NOT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_book ON reviews(book_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_books_author_id ON books(author_id)`,
  `ALTER TABLE books ADD COLUMN IF NOT EXISTS product_type VARCHAR(40) DEFAULT 'book'`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'pending'`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  `CREATE TABLE IF NOT EXISTS book_images (
    id SERIAL PRIMARY KEY,
    book_id INT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS stores (
    id SERIAL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(80) NOT NULL DEFAULT 'Salem',
    pincode VARCHAR(10) NOT NULL,
    phone VARCHAR(30),
    hours VARCHAR(120),
    lat NUMERIC(10,6),
    lng NUMERIC(10,6)
  )`,
  `CREATE TABLE IF NOT EXISTS pincodes (
    pincode VARCHAR(10) PRIMARY KEY,
    city VARCHAR(80) NOT NULL,
    state VARCHAR(80) NOT NULL DEFAULT 'Tamil Nadu',
    express BOOLEAN NOT NULL DEFAULT FALSE,
    eta_days INT NOT NULL DEFAULT 4,
    shipping NUMERIC(8,2) NOT NULL DEFAULT 40
  )`,
  `CREATE TABLE IF NOT EXISTS exams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    slug VARCHAR(180) UNIQUE NOT NULL,
    category VARCHAR(80) NOT NULL,
    exam_date DATE,
    description TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS order_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(80) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE
  )`,
  `CREATE TABLE IF NOT EXISTS gift_cards (
    id SERIAL PRIMARY KEY,
    code VARCHAR(24) UNIQUE NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    remaining NUMERIC(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    buyer_email VARCHAR(180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_email VARCHAR(180)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(40)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_card_code VARCHAR(24)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(80)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(80)`,
  `ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL`,
  `CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(40) UNIQUE NOT NULL,
    description TEXT,
    percent_off INT NOT NULL DEFAULT 0,
    amount_off NUMERIC(10,2) NOT NULL DEFAULT 0,
    min_order NUMERIC(10,2) NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS cms_pages (
    slug VARCHAR(80) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS email_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_email VARCHAR(180) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    sent BOOLEAN NOT NULL DEFAULT FALSE,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE books ADD COLUMN IF NOT EXISTS sku VARCHAR(80)`,
  `ALTER TABLE books ADD COLUMN IF NOT EXISTS erp_id VARCHAR(80)`,
  `ALTER TABLE books ALTER COLUMN isbn13 TYPE VARCHAR(32)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_books_erp_id ON books (erp_id) WHERE erp_id IS NOT NULL`,
];

export async function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await getPool();
  await query(sql);
  for (const stmt of MIGRATIONS) {
    await query(stmt);
  }
  console.log('Schema applied successfully');
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  initSchema()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Schema init failed:', err);
      process.exit(1);
    });
}

export default initSchema;
