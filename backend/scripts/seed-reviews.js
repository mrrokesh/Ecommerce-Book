import { initSchema } from '../src/db/init.js';
import { seedDatabase } from '../src/db/seed.js';
import { query } from '../src/db/pool.js';

await initSchema();

const r = await query('SELECT COUNT(*)::int AS c FROM reviews');
console.log('reviews before', r.rows[0].c);

if (r.rows[0].c === 0) {
  // Books already exist — only seed reviews via seedDatabase path
  // seedDatabase skips existing books but seeds reviews when empty
  await seedDatabase();
} else {
  await query(`
    UPDATE books SET
      publisher = COALESCE(publisher, 'Salem Book House'),
      binding = COALESCE(binding, 'Paper Back'),
      publishing_date = COALESCE(publishing_date, '2020'),
      edition = COALESCE(edition, '1'),
      is_bestseller = CASE
        WHEN is_featured OR discount_percent >= 15 THEN TRUE
        ELSE COALESCE(is_bestseller, FALSE)
      END
  `);
  console.log('books enriched');
}

const r2 = await query('SELECT COUNT(*)::int AS c FROM reviews');
const b = await query('SELECT COUNT(*)::int AS c FROM books');
const sample = await query(`
  SELECT b.title, COUNT(r.id)::int AS reviews, ROUND(AVG(r.rating)::numeric,1) AS avg
  FROM books b LEFT JOIN reviews r ON r.book_id = b.id
  GROUP BY b.id ORDER BY reviews DESC LIMIT 3
`);
console.log('reviews', r2.rows[0].c, 'books', b.rows[0].c);
console.log(sample.rows);
process.exit(0);
