import { query, getPool } from '../db/pool.js';

const books = await query(`SELECT id FROM categories WHERE slug = 'books'`);
if (!books.rows[0]) {
  console.error('Books category missing');
  await (await getPool()).end();
  process.exit(1);
}

const tamil = await query(
  `INSERT INTO categories (name, slug, parent_id, sort_order)
   VALUES ('Tamil', 'tamil', $1, 18)
   ON CONFLICT (slug) DO UPDATE SET
     name = 'Tamil',
     parent_id = EXCLUDED.parent_id,
     sort_order = EXCLUDED.sort_order
   RETURNING id, name, slug, parent_id`,
  [books.rows[0].id]
);

console.log('Tamil now under Books:', tamil.rows[0]);
await (await getPool()).end();
