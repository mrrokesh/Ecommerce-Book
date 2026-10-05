import { query } from '../db/pool.js';
import { isBlockedImage, coverPath } from '../utils/covers.js';

export async function replaceSapnaImages() {
  const books = await query(
    `SELECT id, slug, image_url FROM books
     WHERE image_url ILIKE '%sapna%' OR image_url ILIKE '%cdn01%'`
  );
  for (const b of books.rows) {
    const next = coverPath(b.slug);
    await query(`UPDATE books SET image_url = $2, source_url = NULL WHERE id = $1`, [b.id, next]);
  }
  await query(
    `UPDATE book_images bi
     SET image_url = '/api/covers/' || b.slug || '.svg'
     FROM books b
     WHERE b.id = bi.book_id
       AND (bi.image_url ILIKE '%sapna%' OR bi.image_url ILIKE '%cdn01%')`
  );
  await query(
    `UPDATE banners SET image_url = NULL
     WHERE image_url ILIKE '%sapna%' OR image_url ILIKE '%cdn01%'`
  );
  if (books.rows.length) {
    console.log(`Replaced ${books.rows.length} Sapna image URLs with Salem Book House covers`);
  }
}

export { isBlockedImage, coverPath };
