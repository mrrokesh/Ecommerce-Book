import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

const DEFAULTS = {
  about: {
    title: 'About Salem Book House',
    body: `Salem Book House is Salem's neighbourhood book mall. We stock fiction, non-fiction, Kannada titles, competitive exam books, stationery, toys and e-gift cards.

Our Fairlands flagship and two additional Salem stores serve readers who want genuine editions, careful packing and reliable delivery across Tamil Nadu.

The catalogue on this site is stored in PostgreSQL.`,
  },
  contact: {
    title: 'Contact Us',
    body: `Customer care: +91 427 123 4567
Email: care@salembookhouse.com
Hours: 9:30 AM to 6:30 PM, Monday–Saturday

Visit us at 12, Omalur Main Road, Fairlands, Salem 636016.`,
  },
  terms: {
    title: 'Terms & Conditions',
    body: `By using Salem Book House you agree to purchase products as listed and pay the shown price (inclusive of applicable taxes).

Orders may be cancelled before dispatch. Returns of unused items are accepted within 7 days if the product is damaged or not as described.

Online payments use Razorpay when keys are configured; otherwise checkout is simulated.`,
  },
  privacy: {
    title: 'Privacy Policy',
    body: `We store your name, email, phone and delivery addresses to fulfil orders. Passwords are hashed. We do not sell personal data.

Guest checkout stores only the email and shipping details needed for that order.`,
  },
  faq: {
    title: 'FAQs',
    body: `Q: Do you deliver outside Salem?
A: Yes. Express pincodes (636, 637, 638) get faster shipping.

Q: How do coupons work?
A: Try WELCOME10 (10% off over ₹199) or SALEM50 (₹50 off over ₹499).

Q: How do e-gift cards work?
A: After purchase you receive a code. Enter it at checkout to redeem.`,
  },
};

export async function seedCmsPages() {
  for (const [slug, page] of Object.entries(DEFAULTS)) {
    await query(
      `INSERT INTO cms_pages (slug, title, body) VALUES ($1,$2,$3)
       ON CONFLICT (slug) DO NOTHING`,
      [slug, page.title, page.body]
    );
  }
}

router.get('/:slug', async (req, res) => {
  try {
    const { rows } = await query(`SELECT slug, title, body FROM cms_pages WHERE slug = $1`, [
      req.params.slug,
    ]);
    const page = rows[0] || (DEFAULTS[req.params.slug]
      ? { slug: req.params.slug, ...DEFAULTS[req.params.slug] }
      : null);
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });
    return res.json({ success: true, data: { page } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to load page' });
  }
});

export default router;
