import 'dotenv/config';
import { query, getPool } from '../db/pool.js';

const { rows: books } = await query(
  `SELECT id, title, image_url FROM books
   WHERE image_url LIKE '/uploads/media/%'
   ORDER BY id DESC
   LIMIT 10`
);
console.log('media covers', books.length, books.map((b) => b.image_url));
const covers = books.map((b) => b.image_url);
if (!covers.length) {
  console.log('No /uploads/media covers found');
  process.exit(0);
}
const { rows: banners } = await query(`SELECT id FROM banners ORDER BY sort_order, id`);
for (let i = 0; i < banners.length; i += 1) {
  const url = covers[i % covers.length];
  await query(`UPDATE banners SET image_url = $2 WHERE id = $1`, [banners[i].id, url]);
  console.log(`banner ${banners[i].id} ← ${url}`);
}
const pool = await getPool();
await pool.end?.();
