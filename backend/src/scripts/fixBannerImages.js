import 'dotenv/config';
import { query, getPool } from '../db/pool.js';

/** Assign cover images to homepage banners that have none. */
async function main() {
  const { rows: books } = await query(
    `SELECT image_url FROM books
     WHERE image_url ILIKE '/uploads/%'
     ORDER BY is_featured DESC NULLS LAST, is_bestseller DESC, id DESC
     LIMIT 10`
  );
  const covers = books.map((b) => b.image_url).filter(Boolean);
  if (!covers.length) {
    console.log('No book covers available to use as banners');
    process.exit(0);
  }
  const { rows: banners } = await query(
    `SELECT id, title, image_url FROM banners ORDER BY sort_order, id`
  );
  const force = process.argv.includes('--force');
  let i = 0;
  for (const b of banners) {
    const hasUpload = String(b.image_url || '').startsWith('/uploads/');
    if (b.image_url && hasUpload && !force) {
      console.log(`banner ${b.id} already has upload image`);
      continue;
    }
    if (b.image_url && !force && !process.argv.includes('--prefer-uploads')) {
      console.log(`banner ${b.id} already has image`);
      continue;
    }
    const url = covers[i % covers.length];
    i += 1;
    await query(`UPDATE banners SET image_url = $2 WHERE id = $1`, [b.id, url]);
    console.log(`banner ${b.id} ← ${url}`);
  }
  const pool = await getPool();
  await pool.end?.();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
