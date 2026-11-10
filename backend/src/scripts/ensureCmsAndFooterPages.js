import { query } from '../db/pool.js';

const PAGES = {
  about: {
    title: 'About Salem Book House',
    body: `Salem Book House is Salem's favourite book mall — a trusted neighbourhood destination for readers, students and families across Tamil Nadu.

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
  },
  contact: {
    title: 'Contact Us',
    body: `Support
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

Location: https://maps.app.goo.gl/ugcd7ja9bGT2WGdR8?g_st=ic

Owner
Parasuraman Muthusamy`,
  },
  terms: {
    title: 'Terms & Conditions',
    body: `Welcome to Salem Book House. By browsing or placing an order on this website, you agree to these terms.

Orders & pricing
Product prices include applicable taxes unless stated otherwise. We may refuse or cancel an order if stock, pricing or payment issues arise. You will be notified if that happens.

Shipping & delivery
We deliver across Tamil Nadu and other serviceable pincodes. Delivery times depend on your location and courier partner. Express delivery may be available for selected Salem-region pincodes.

Cancellations & returns
You may request cancellation before dispatch. Unused products that arrive damaged or not as described may be returned within 7 days of delivery with proof of purchase. Perishable or opened stationery may not be returnable.

Payments
We accept UPI, cards, net banking and Cash on Delivery where available. Online payments are processed through our payment partner when configured.

E-gift cards
E-gift card codes are non-transferable after redemption and cannot be exchanged for cash.

Store visits
Store hours and stock may differ from the online catalogue. Contact us before visiting for large or special orders.

Contact
For help: support@salembookhouse.com or 9487724584 / 7904957436 / 0427-2411315.`,
  },
  privacy: {
    title: 'Privacy Policy',
    body: `Salem Book House respects your privacy.

What we collect
Name, email, phone, delivery address and order details needed to fulfil purchases. Account passwords are stored hashed. Guest checkout stores only what is required for that order.

How we use data
To process orders, arrange delivery, send order updates and improve our store experience. We may contact you about your order via phone, WhatsApp, SMS or email.

Sharing
We share data only with delivery/payment partners as needed to complete your order. We do not sell personal data.

Security
We use industry-standard practices including SSL encryption for the site. No method of transmission is 100% secure.

Your choices
You may request updates or deletion of account data by contacting support@salembookhouse.com, subject to legal retention needs for invoices and orders.

Contact
Owner: Parasuraman Muthusamy
Email: support@salembookhouse.com
Phone: 9487724584`,
  },
  faq: {
    title: 'FAQs',
    body: `Q: Do you deliver outside Salem?
A: Yes. We deliver across Tamil Nadu and other serviceable pincodes. Express options may apply for 636 / 637 / 638 series pincodes.

Q: How do I check delivery for my pincode?
A: Use the Deliver to / pincode checker in the header, or enter your pincode at checkout.

Q: What payment methods do you accept?
A: UPI, Visa, Mastercard, RuPay, net banking and Cash on Delivery where available.

Q: How do coupons work?
A: Try WELCOME10 (10% off over ₹199) or SALEM50 (₹50 off over ₹499) at checkout when active.

Q: How do e-gift cards work?
A: After purchase you receive a code. Enter it at checkout to redeem the balance.

Q: Can I track my order?
A: Yes — use Track Order in the footer or visit /track with your order details.

Q: What are store hours?
A: Mon–Sat 9:30 AM – 9:00 PM; Sun 10:00 AM – 8:00 PM (* subject to change).

Q: Who owns Salem Book House?
A: Parasuraman Muthusamy.

Q: How do I contact support?
A: Call 9487724584 / 7904957436 / 0427-2411315, email support@salembookhouse.com, or WhatsApp 9487724584.`,
  },
};

const CATEGORIES = [
  ['Books', 'books', null, 1],
  ['School & Board', 'school-board', null, 3],
  ['Competitive Exams', 'competitive-exams', null, 2],
  ['College', 'college', null, 4],
  ['Stationery', 'stationery', null, 5],
  ['Toys', 'toys', null, 6],
  ['Gifts', 'gifts', null, 7],
  ['Accessories', 'accessories', null, 8],
  ['E Gift Card', 'e-gift-card', null, 9],
  ['New Arrivals', 'new-arrivals', null, 90],
  ['Pre-Order', 'pre-order', null, 91],
  ['Tamil', 'tamil', 'books', 10],
];

async function ensureCategory(name, slug, parentSlug, sortOrder) {
  const { rows } = await query(
    `INSERT INTO categories (name, slug, sort_order)
     VALUES ($1,$2,$3)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order
     RETURNING id`,
    [name, slug, sortOrder]
  );
  if (parentSlug) {
    const parent = await query(`SELECT id FROM categories WHERE slug = $1`, [parentSlug]);
    if (parent.rows[0]) {
      await query(`UPDATE categories SET parent_id = $1 WHERE id = $2`, [parent.rows[0].id, rows[0].id]);
    }
  }
}

for (const [slug, page] of Object.entries(PAGES)) {
  const r = await query(
    `INSERT INTO cms_pages (slug, title, body, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, updated_at = NOW()
     RETURNING slug, title, length(body) AS body_len`,
    [slug, page.title, page.body]
  );
  console.log('CMS', r.rows[0]);
}

for (const [name, slug, parent, sort] of CATEGORIES) {
  await ensureCategory(name, slug, parent, sort);
  console.log('Category OK:', slug);
}

const stores = await query(`SELECT count(*)::int AS n FROM stores`);
if (!stores.rows[0].n) {
  await query(
    `INSERT INTO stores (name, address, city, pincode, phone, hours, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      'Salem Book House',
      'Salem, Tamil Nadu',
      'Salem',
      '636001',
      '9487724584',
      'Mon–Sat 9:30–9:00 · Sun 10:00–8:00 (* changeable)',
      11.6643,
      78.146,
    ]
  );
  console.log('Inserted flagship store');
} else {
  console.log('Stores already present:', stores.rows[0].n);
}

console.log('Footer CMS + categories ready');
process.exit(0);
