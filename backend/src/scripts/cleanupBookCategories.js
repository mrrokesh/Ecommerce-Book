import { query, getPool } from '../db/pool.js';

/** Shop facets / homepage sections wrongly nested under Books. */
const DETACH = ['pre-order', 'new-arrivals', 'best-sellers', 'featured-author', 'young-adult', 'children'];

for (const slug of DETACH) {
  const r = await query(`UPDATE categories SET parent_id = NULL WHERE slug = $1 RETURNING name, slug`, [slug]);
  if (r.rowCount) console.log('detached', r.rows[0]);
}

// Prefer "Children Books" — hide duplicate bare "Children" if both exist under books
await query(
  `UPDATE categories c
   SET parent_id = NULL
   WHERE c.slug = 'children'
     AND EXISTS (SELECT 1 FROM categories b WHERE b.slug = 'children-books')`
);

const { rows } = await query(
  `SELECT c.name, c.slug
   FROM categories c
   JOIN categories p ON p.id = c.parent_id
   WHERE p.slug = 'books'
   ORDER BY c.sort_order, c.name`
);
console.table(rows);
await (await getPool()).end();
