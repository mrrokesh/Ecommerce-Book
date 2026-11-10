import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { query } = await import('../db/pool.js');

// Storefront menus now come straight from the categories table, so move the
// visibility/order rules that used to be hardcoded in the frontend into the data.
await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE`);

const hidden = await query(
  `UPDATE categories SET is_visible = FALSE
   WHERE slug IN ('kannada', 'young-adult', 'best-sellers', 'children', 'featured-author')
   RETURNING slug`
);
console.log('Hidden:', hidden.rows.map((r) => r.slug).join(', ') || '(none)');

const order = [
  ['books', 1],
  ['school-board', 2],
  ['competitive-exams', 3],
  ['college', 4],
  ['stationery', 5],
  ['toys', 6],
  ['gifts', 7],
  ['accessories', 8],
  ['e-gift-card', 9],
  ['new-arrivals', 90],
  ['pre-order', 91],
];
for (const [slug, sort] of order) {
  await query(`UPDATE categories SET sort_order = $2 WHERE slug = $1 AND parent_id IS NULL`, [slug, sort]);
}

const { rows } = await query(
  `SELECT slug, sort_order, is_visible, badge FROM categories WHERE parent_id IS NULL ORDER BY sort_order, name`
);
for (const r of rows) {
  console.log(`${r.is_visible ? 'shown ' : 'hidden'}  ${String(r.sort_order).padStart(3)}  ${r.slug}${r.badge ? ` [${r.badge}]` : ''}`);
}
process.exit(0);
