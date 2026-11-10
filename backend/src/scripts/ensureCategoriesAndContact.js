/**
 * Upsert store categories + real SBH support/store/CMS contact details.
 */
import { query, getPool } from '../db/pool.js';

async function ensureCategory(name, slug, parentSlug, badge, sortOrder) {
  const { rows } = await query(
    `INSERT INTO categories (name, slug, badge, sort_order)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       badge = COALESCE(EXCLUDED.badge, categories.badge),
       sort_order = EXCLUDED.sort_order
     RETURNING id, slug`,
    [name, slug, badge || null, sortOrder ?? 50]
  );
  if (parentSlug) {
    const parent = await query(`SELECT id FROM categories WHERE slug = $1`, [parentSlug]);
    if (parent.rows[0]) {
      await query(`UPDATE categories SET parent_id = $1 WHERE id = $2`, [parent.rows[0].id, rows[0].id]);
    }
  } else {
    await query(`UPDATE categories SET parent_id = NULL WHERE id = $1`, [rows[0].id]);
  }
  return rows[0].id;
}

const CONTACT_BODY = `Support
Phone: 9487724584
Phone: 7904957436
Landline: 0427-2411315

Email: support@salembookhouse.com

Hours
Mon – Sat: 9:30 AM – 9:00 PM
Sun: 10:00 AM – 8:00 PM
* Subject to change

WhatsApp: 9487724584
Instagram: @salembookhouse — https://www.instagram.com/salembookhouse

Location: https://maps.app.goo.gl/ugcd7ja9bGT2WGdR8?g_st=ic`;

async function main() {
  // —— Top-level ——
  await ensureCategory('Books', 'books', null, null, 1);
  await ensureCategory('Competitive Exams', 'competitive-exams', null, null, 2);
  await ensureCategory('School & Board', 'school-board', null, null, 3);
  await ensureCategory('College', 'college', null, null, 4);
  await ensureCategory('Stationery', 'stationery', null, 'NEW', 5);
  await ensureCategory('Toys', 'toys', null, null, 6);
  await ensureCategory('Gifts', 'gifts', null, null, 7);
  await ensureCategory('Accessories', 'accessories', null, null, 8);
  await ensureCategory('E Gift Card', 'e-gift-card', null, null, 9);

  // —— Books ——
  await ensureCategory('Tamil', 'tamil', 'books', null, 10);
  await ensureCategory('Novels', 'novels', 'books', null, 11);
  await ensureCategory('General books', 'general-books', 'books', null, 12);
  await ensureCategory('Children Books', 'children-books', 'books', null, 13);
  await ensureCategory('Astrology', 'astrology', 'books', null, 14);
  await ensureCategory('Epics', 'epics', 'books', null, 15);
  await ensureCategory('Fiction', 'fiction', 'books', null, 16);
  await ensureCategory('Non Fiction', 'non-fiction', 'books', null, 17);

  // —— Competitive exams ——
  await ensureCategory('TNPSC', 'tnpsc', 'competitive-exams', null, 21);
  await ensureCategory('NEET', 'neet', 'competitive-exams', null, 22);
  await ensureCategory('JEE', 'jee', 'competitive-exams', null, 23);
  await ensureCategory('UPSC', 'upsc', 'competitive-exams', null, 24);
  await ensureCategory('Banking', 'banking', 'competitive-exams', null, 25);

  // —— School & Board ——
  await ensureCategory('NCERT', 'ncert', 'school-board', null, 31);
  await ensureCategory('CBSE Guides', 'cbse-guides', 'school-board', null, 32);
  await ensureCategory('State board Guides', 'state-board-guides', 'school-board', null, 33);
  await ensureCategory('SCERT', 'scert', 'school-board', null, 34);

  // —— College / professional ——
  await ensureCategory('College textbooks', 'college-textbooks', 'college', null, 41);
  await ensureCategory('Medical', 'medical', 'college', null, 42);
  await ensureCategory('Nursing', 'nursing', 'college', null, 43);

  // —— Stationery ——
  await ensureCategory('School bags', 'school-bags', 'stationery', null, 51);
  await ensureCategory('Notebooks', 'notebooks', 'stationery', null, 52);
  await ensureCategory('Pens', 'pens', 'stationery', null, 53);
  await ensureCategory('Art Supplies', 'art-supplies', 'stationery', null, 54);

  // —— Toys ——
  await ensureCategory('Soft toys', 'soft-toys', 'toys', null, 61);
  await ensureCategory('Puzzles', 'puzzles', 'toys', null, 62);
  await ensureCategory('Educational Toys', 'educational-toys', 'toys', null, 63);

  // —— Accessories ——
  await ensureCategory('Shoes', 'shoes', 'accessories', null, 71);
  await ensureCategory('Socks', 'socks', 'accessories', null, 72);
  await ensureCategory('Jute bags', 'jute-bags', 'accessories', null, 73);

  // —— Gifts (top-level already) ——

  // Contact CMS (overwrite demo text)
  await query(
    `INSERT INTO cms_pages (slug, title, body) VALUES ('contact', 'Contact Us', $1)
     ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body`,
    [CONTACT_BODY]
  );

  await query(
    `INSERT INTO cms_pages (slug, title, body) VALUES ('about', 'About Salem Book House', $1)
     ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body`,
    [
      `Salem Book House is Salem's favourite book mall — a trusted neighbourhood destination for readers, students and families across Tamil Nadu.

Owner
Parasuraman Muthusamy

What we offer
We stock Tamil and English books, school & board guides (NCERT, CBSE, State Board), competitive exam materials (TNPSC, NEET, JEE, UPSC, Banking), college textbooks, novels, stationery, toys, gifts, accessories and e-gift cards.

Why shop with us
Genuine editions, careful packing and reliable delivery. Browse online or visit our Salem store for personal help finding the right book.

Visit & support
Phone: 9487724584
Phone: 7904957436
Landline: 0427-2411315
Email: support@salembookhouse.com
WhatsApp: 9487724584
Instagram: @salembookhouse — https://www.instagram.com/salembookhouse
Location: https://maps.app.goo.gl/ugcd7ja9bGT2WGdR8?g_st=ic

Hours
Mon – Sat: 9:30 AM – 9:00 PM
Sun: 10:00 AM – 8:00 PM
* Subject to change`,
    ]
  );

  // Replace demo multi-store list with the real flagship store
  await query(`DELETE FROM stores`);
  await query(
    `INSERT INTO stores (name, address, city, pincode, phone, hours, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      'Salem Book House',
      'Salem, Tamil Nadu · Also: 7904957436, 0427-2411315',
      'Salem',
      '636001',
      '9487724584',
      'Mon–Sat 9:30–9:00 · Sun 10:00–8:00 (* changeable)',
      11.6643,
      78.146,
    ]
  );

  const { rows: cats } = await query(
    `SELECT name, slug, (SELECT name FROM categories p WHERE p.id = categories.parent_id) AS parent
     FROM categories
     WHERE slug = ANY($1)
     ORDER BY sort_order, name`,
    [
      [
        'tnpsc',
        'neet',
        'jee',
        'medical',
        'nursing',
        'college-textbooks',
        'novels',
        'general-books',
        'children-books',
        'stationery',
        'school-bags',
        'shoes',
        'socks',
        'jute-bags',
        'soft-toys',
        'gifts',
        'astrology',
        'epics',
        'ncert',
        'cbse-guides',
        'state-board-guides',
        'scert',
      ],
    ]
  );
  console.table(cats);
  console.log('Categories + contact details updated.');
  const p = await getPool();
  await p.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    const p = await getPool();
    await p.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
