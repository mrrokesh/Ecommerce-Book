import { query } from '../db/pool.js';

const TITLE = 'About Salem Book House';
const BODY = `Salem Book House is Salem's favourite book mall — a trusted neighbourhood destination for readers, students and families across Tamil Nadu.

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
* Subject to change`;

const r = await query(
  `INSERT INTO cms_pages (slug, title, body, updated_at)
   VALUES ('about', $1, $2, NOW())
   ON CONFLICT (slug) DO UPDATE SET
     title = EXCLUDED.title,
     body = EXCLUDED.body,
     updated_at = NOW()
   RETURNING slug, title, left(body, 80) AS preview, length(body) AS body_len`,
  [TITLE, BODY]
);

console.log(r.rows[0]);
process.exit(0);
