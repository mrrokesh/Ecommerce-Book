/**
 * One-off migration: Kannada → Tamil (category, book language, author bios, CMS pages).
 *
 * Dry run by default (rolls back). Back up the database, then pass --apply to commit:
 *   node src/scripts/replaceKannadaWithTamil.js --apply
 */
import { getPool } from '../db/pool.js';

const apply = process.argv.includes('--apply');
const client = await (await getPool()).connect();

try {
  await client.query('BEGIN');

  const tamil = await client.query(
    `INSERT INTO categories (name, slug, sort_order)
     VALUES ('Tamil', 'tamil', 10)
     ON CONFLICT (slug) DO UPDATE SET name = 'Tamil'
     RETURNING id`
  );
  const tamilId = tamil.rows[0].id;

  const kannada = await client.query(`SELECT id FROM categories WHERE slug = 'kannada'`);
  if (kannada.rows[0]) {
    const kid = kannada.rows[0].id;
    await client.query(
      `INSERT INTO book_categories (book_id, category_id)
       SELECT book_id, $1 FROM book_categories WHERE category_id = $2
       ON CONFLICT DO NOTHING`,
      [tamilId, kid]
    );
    await client.query(`DELETE FROM book_categories WHERE category_id = $1`, [kid]);
    await client.query(`DELETE FROM categories WHERE id = $1`, [kid]);
    console.log('Removed Kannada category; books remapped to Tamil');
  }

  const lang = await client.query(
    `UPDATE books SET language = 'Tamil' WHERE language ILIKE 'kannada' RETURNING id`
  );
  console.log('Books language Kannada → Tamil:', lang.rowCount);

  const authors = await client.query(
    `UPDATE authors SET bio = REPLACE(REPLACE(bio, 'Kannada', 'Tamil'), 'kannada', 'Tamil')
     WHERE bio ILIKE '%kannada%' RETURNING id, name`
  );
  console.log('Author bios updated:', authors.rows.map((r) => `${r.id}:${r.name}`));

  const pages = await client.query(
    `UPDATE cms_pages SET body = REPLACE(REPLACE(body, 'Kannada', 'Tamil'), 'kannada', 'Tamil')
     WHERE body ILIKE '%kannada%' RETURNING slug`
  );
  console.log('CMS pages updated:', pages.rows.map((r) => r.slug));

  if (apply) {
    await client.query('COMMIT');
    console.log('COMMITTED. Tamil category id:', tamilId);
  } else {
    await client.query('ROLLBACK');
    console.log('DRY RUN — rolled back. Re-run with --apply to commit.');
  }
} catch (err) {
  await client.query('ROLLBACK');
  console.error(err);
  process.exitCode = 1;
} finally {
  client.release();
  await (await getPool()).end();
}
