import { query, getPool } from '../db/pool.js';

const r = await query(
  `UPDATE categories SET sort_order = 10 WHERE slug = 'tamil' RETURNING id, name, slug, parent_id, sort_order`
);
console.log(r.rows[0]);
await (await getPool()).end();
