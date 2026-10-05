import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.join(__dirname, '../../uploads/catalog');

function catalogArt(slug, title, hue) {
  fs.mkdirSync(catalogDir, { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520" viewBox="0 0 400 520">
  <rect width="400" height="520" fill="hsl(${hue},42%,88%)"/>
  <rect x="40" y="40" width="320" height="360" rx="16" fill="hsl(${hue},45%,32%)"/>
  <text x="200" y="230" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-size="22">${String(title).slice(0, 28).replace(/&/g, 'and')}</text>
  <text x="200" y="470" text-anchor="middle" fill="hsl(${hue},45%,25%)" font-family="Georgia,serif" font-size="18">Salem Book House</text>
</svg>`;
  fs.writeFileSync(path.join(catalogDir, `${slug}.svg`), svg);
  return `/uploads/catalog/${slug}.svg`;
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function ensureCategory(name, slug, parentSlug, badge, sortOrder) {
  const { rows } = await query(
    `INSERT INTO categories (name, slug, badge, sort_order)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, badge = COALESCE(EXCLUDED.badge, categories.badge)
     RETURNING id, slug`,
    [name, slug, badge || null, sortOrder ?? 50]
  );
  if (parentSlug) {
    const parent = await query(`SELECT id FROM categories WHERE slug = $1`, [parentSlug]);
    if (parent.rows[0]) {
      await query(`UPDATE categories SET parent_id = $1 WHERE id = $2`, [parent.rows[0].id, rows[0].id]);
    }
  }
  return rows[0].id;
}

async function insertProduct({
  title,
  author = 'Salem Book House',
  mrp,
  sale,
  categorySlugs,
  language = 'English',
  publisher = 'Salem Book House',
  productType = 'book',
  image,
  description,
}) {
  const slug = `${slugify(title)}-${String(mrp)}${String(sale)}`;
  const hue = (slugify(title).length * 17 + title.length * 9) % 360;
  const img = catalogArt(slug, title, hue);
  const existing = await query(`SELECT id FROM books WHERE slug = $1`, [slug]);
  if (existing.rows[0]) {
    await query(`UPDATE books SET image_url = $2 WHERE id = $1`, [existing.rows[0].id, img]);
    return existing.rows[0].id;
  }

  const authorRes = await query(
    `INSERT INTO authors (name, featured) VALUES ($1, FALSE)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [author]
  );

  const discount = mrp > sale ? Math.round(((mrp - sale) / mrp) * 100) : 0;
  const { rows } = await query(
    `INSERT INTO books (
       title, slug, author_id, author_name, description, image_url,
       mrp, sale_price, discount_percent, stock, language, publisher,
       binding, publishing_date, edition, is_featured, is_bestseller, product_type
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Paper Back','2025','1', FALSE, $13, $14)
     RETURNING id`,
    [
      title,
      slug,
      authorRes.rows[0].id,
      author,
      description || `${title} available at Salem Book House.`,
      img,
      mrp,
      sale,
      discount,
      40 + (title.length % 40),
      language,
      publisher,
      discount >= 15,
      productType,
    ]
  );
  const bookId = rows[0].id;
  await query(`INSERT INTO book_images (book_id, image_url, sort_order) VALUES ($1,$2,0)`, [
    bookId,
    img,
  ]);
  for (const s of categorySlugs) {
    const cat = await query(`SELECT id FROM categories WHERE slug = $1`, [s]);
    if (cat.rows[0]) {
      await query(
        `INSERT INTO book_categories (book_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [bookId, cat.rows[0].id]
      );
    }
  }
  return bookId;
}

export async function seedExtras() {
  const adminHash = await bcrypt.hash('Admin@123', 10);
  await query(
    `INSERT INTO users (name, email, password_hash, role, phone)
     VALUES ($1,$2,$3,'admin',$4)
     ON CONFLICT (email) DO UPDATE SET role = 'admin', password_hash = EXCLUDED.password_hash`,
    ['Store Admin', 'admin@salembookhouse.com', adminHash, '04271234567']
  );

  await ensureCategory('Books', 'books', null, null, 1);
  await ensureCategory('Fiction', 'fiction', 'books', null, 2);
  await ensureCategory('Non Fiction', 'non-fiction', 'books', null, 3);
  await ensureCategory('Young Adult', 'young-adult', 'books', null, 4);
  await ensureCategory('Kannada', 'kannada', null, null, 5);
  await ensureCategory('Stationery', 'stationery', null, 'NEW', 6);
  await ensureCategory('Notebooks', 'notebooks', 'stationery', null, 61);
  await ensureCategory('Pens', 'pens', 'stationery', null, 62);
  await ensureCategory('Art Supplies', 'art-supplies', 'stationery', null, 63);
  await ensureCategory('Toys', 'toys', null, null, 7);
  await ensureCategory('Puzzles', 'puzzles', 'toys', null, 71);
  await ensureCategory('Educational Toys', 'educational-toys', 'toys', null, 72);
  await ensureCategory('Competitive Exams', 'competitive-exams', null, null, 8);
  await ensureCategory('UPSC', 'upsc', 'competitive-exams', null, 81);
  await ensureCategory('Banking', 'banking', 'competitive-exams', null, 82);
  await ensureCategory('E Gift Card', 'e-gift-card', null, null, 9);

  const extra = [
    {
      title: 'A5 Ruled Notebook — 200 Pages',
      author: 'SBH Stationery',
      mrp: 120,
      sale: 89,
      categorySlugs: ['stationery', 'notebooks'],
      productType: 'stationery',
      image: '/placeholders/stationery.svg',
    },
    {
      title: 'Spiral Long Notebook Pack of 4',
      author: 'SBH Stationery',
      mrp: 240,
      sale: 179,
      categorySlugs: ['stationery', 'notebooks'],
      productType: 'stationery',
      image: '/placeholders/stationery.svg',
    },
    {
      title: 'Gel Pen Set — 10 Colours',
      author: 'SBH Stationery',
      mrp: 199,
      sale: 149,
      categorySlugs: ['stationery', 'pens'],
      productType: 'stationery',
      image: '/placeholders/stationery.svg',
    },
    {
      title: 'Fountain Pen with Extra Nib',
      author: 'SBH Stationery',
      mrp: 450,
      sale: 349,
      categorySlugs: ['stationery', 'pens'],
      productType: 'stationery',
      image: '/placeholders/stationery.svg',
    },
    {
      title: 'Watercolour Cake Set 18 Shades',
      author: 'SBH Art',
      mrp: 399,
      sale: 299,
      categorySlugs: ['stationery', 'art-supplies'],
      productType: 'stationery',
      image: '/placeholders/stationery.svg',
    },
    {
      title: 'Sketch Book A4 120 GSM',
      author: 'SBH Art',
      mrp: 220,
      sale: 169,
      categorySlugs: ['stationery', 'art-supplies'],
      productType: 'stationery',
      image: '/placeholders/stationery.svg',
    },
    {
      title: 'Wooden Puzzle Map of India',
      author: 'SBH Toys',
      mrp: 599,
      sale: 449,
      categorySlugs: ['toys', 'puzzles', 'educational-toys'],
      productType: 'toy',
      image: '/placeholders/toys.svg',
    },
    {
      title: '1000 Piece World Map Puzzle',
      author: 'SBH Toys',
      mrp: 899,
      sale: 699,
      categorySlugs: ['toys', 'puzzles'],
      productType: 'toy',
      image: '/placeholders/toys.svg',
    },
    {
      title: 'Abacus Learning Kit',
      author: 'SBH Toys',
      mrp: 349,
      sale: 259,
      categorySlugs: ['toys', 'educational-toys'],
      productType: 'toy',
      image: '/placeholders/toys.svg',
    },
    {
      title: 'Science Experiment Box for Kids',
      author: 'SBH Toys',
      mrp: 799,
      sale: 649,
      categorySlugs: ['toys', 'educational-toys'],
      productType: 'toy',
      image: '/placeholders/toys.svg',
    },
    {
      title: 'Building Blocks 120 Pieces',
      author: 'SBH Toys',
      mrp: 699,
      sale: 499,
      categorySlugs: ['toys'],
      productType: 'toy',
      image: '/placeholders/toys.svg',
    },
    {
      title: 'Salem Book House E-Gift Card Rs 250',
      author: 'Salem Book House',
      mrp: 250,
      sale: 250,
      categorySlugs: ['e-gift-card'],
      productType: 'gift-card',
      image: '/placeholders/gift.svg',
      description: 'Digital gift card. Code emailed after purchase. Valid 12 months.',
    },
    {
      title: 'Salem Book House E-Gift Card Rs 500',
      author: 'Salem Book House',
      mrp: 500,
      sale: 500,
      categorySlugs: ['e-gift-card'],
      productType: 'gift-card',
      image: '/placeholders/gift.svg',
    },
    {
      title: 'Salem Book House E-Gift Card Rs 1000',
      author: 'Salem Book House',
      mrp: 1000,
      sale: 1000,
      categorySlugs: ['e-gift-card'],
      productType: 'gift-card',
      image: '/placeholders/gift.svg',
    },
    {
      title: 'Lakshmikant Indian Polity — Latest Edition',
      author: 'M Laxmikanth',
      mrp: 895,
      sale: 699,
      categorySlugs: ['competitive-exams', 'upsc', 'non-fiction'],
      productType: 'book',
      image: '/placeholder-book.svg',
    },
    {
      title: 'Quantitative Aptitude for Bank Exams',
      author: 'R S Aggarwal',
      mrp: 750,
      sale: 599,
      categorySlugs: ['competitive-exams', 'banking'],
      productType: 'book',
      image: '/placeholder-book.svg',
    },
  ];

  for (const p of extra) {
    await insertProduct(p);
  }

  const storeCount = await query(`SELECT COUNT(*)::int AS c FROM stores`);
  if (storeCount.rows[0].c === 0) {
    const stores = [
      [
        'Salem Book House — Fairlands',
        '12, Omalur Main Road, Fairlands',
        'Salem',
        '636016',
        '+91 427 123 4567',
        '9:30 AM – 8:30 PM',
        11.6643,
        78.1460,
      ],
      [
        'Salem Book House — New Bus Stand',
        'Shop 4, Near New Bus Stand, Shevapet',
        'Salem',
        '636002',
        '+91 427 234 5678',
        '9:00 AM – 9:00 PM',
        11.6530,
        78.1570,
      ],
      [
        'Salem Book House — Hasthampatti',
        '44, Junction Main Road, Hasthampatti',
        'Salem',
        '636007',
        '+91 427 345 6789',
        '10:00 AM – 8:00 PM',
        11.6701,
        78.1468,
      ],
    ];
    for (const s of stores) {
      await query(
        `INSERT INTO stores (name, address, city, pincode, phone, hours, lat, lng)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        s
      );
    }
  }

  const pinCount = await query(`SELECT COUNT(*)::int AS c FROM pincodes`);
  if (pinCount.rows[0].c === 0) {
    const pins = [
      ['636001', 'Salem', true, 1, 0],
      ['636002', 'Salem', true, 1, 0],
      ['636004', 'Salem', true, 1, 0],
      ['636007', 'Salem', true, 1, 0],
      ['636016', 'Salem', true, 1, 0],
      ['637001', 'Namakkal', true, 2, 30],
      ['638001', 'Erode', true, 2, 30],
      ['600001', 'Chennai', false, 3, 40],
      ['641001', 'Coimbatore', false, 3, 40],
      ['560001', 'Bengaluru', false, 4, 49],
      ['110001', 'New Delhi', false, 5, 59],
      ['400001', 'Mumbai', false, 5, 59],
    ];
    for (const [pincode, city, express, eta, shipping] of pins) {
      await query(
        `INSERT INTO pincodes (pincode, city, state, express, eta_days, shipping)
         VALUES ($1,$2,'Tamil Nadu',$3,$4,$5)
         ON CONFLICT (pincode) DO NOTHING`,
        [pincode, city, express, eta, shipping]
      );
    }
  }

  const examCount = await query(`SELECT COUNT(*)::int AS c FROM exams`);
  if (examCount.rows[0].c === 0) {
    const exams = [
      ['UPSC CSE Prelims 2027', 'upsc-cse-prelims-2027', 'UPSC', '2027-05-24', 'Civil Services Preliminary Examination'],
      ['IBPS PO Prelims', 'ibps-po-prelims', 'Banking', '2026-10-18', 'Institute of Banking Personnel Selection PO'],
      ['SBI Clerk', 'sbi-clerk', 'Banking', '2026-11-22', 'SBI Junior Associate'],
      ['TNPSC Group 1', 'tnpsc-group-1', 'State', '2026-12-06', 'Tamil Nadu Public Service Commission Group I'],
      ['NEET UG', 'neet-ug', 'Medical', '2027-05-03', 'National Eligibility cum Entrance Test'],
      ['JEE Main Session 1', 'jee-main-s1', 'Engineering', '2027-01-24', 'Joint Entrance Examination Main'],
      ['GATE', 'gate', 'Engineering', '2027-02-07', 'Graduate Aptitude Test in Engineering'],
      ['CLAT', 'clat', 'Law', '2026-12-07', 'Common Law Admission Test'],
    ];
    for (const e of exams) {
      await query(
        `INSERT INTO exams (name, slug, category, exam_date, description) VALUES ($1,$2,$3,$4,$5)`,
        e
      );
    }
  }

  // Extra gallery images for existing books
  const { rows: books } = await query(`SELECT id, image_url FROM books WHERE image_url IS NOT NULL`);
  for (const b of books) {
    const has = await query(`SELECT 1 FROM book_images WHERE book_id = $1 LIMIT 1`, [b.id]);
    if (!has.rows[0]) {
      await query(`INSERT INTO book_images (book_id, image_url, sort_order) VALUES ($1,$2,0)`, [
        b.id,
        b.image_url,
      ]);
      await query(`INSERT INTO book_images (book_id, image_url, sort_order) VALUES ($1,$2,1)`, [
        b.id,
        b.image_url,
      ]);
    }
  }

  await query(
    `INSERT INTO coupons (code, description, percent_off, amount_off, min_order)
     VALUES
       ('WELCOME10', '10% off orders above Rs 199', 10, 0, 199),
       ('SALEM50', 'Rs 50 off orders above Rs 499', 0, 50, 499)
     ON CONFLICT (code) DO NOTHING`
  );

  const cms = [
    ['about', 'About Salem Book House', "Salem Book House is Salem's neighbourhood book mall."],
    ['contact', 'Contact Us', 'Customer care: +91 427 123 4567\nEmail: care@salembookhouse.com'],
    ['terms', 'Terms & Conditions', 'Cancel before dispatch. Returns within 7 days of delivery for unused items.'],
    ['privacy', 'Privacy Policy', 'We store account and order details only to fulfil purchases. Passwords are hashed.'],
    ['faq', 'FAQs', 'Coupons: WELCOME10 and SALEM50. Gift cards redeem at checkout. Express delivery on 636/637/638 pincodes.'],
  ];
  for (const [slug, title, body] of cms) {
    await query(
      `INSERT INTO cms_pages (slug, title, body) VALUES ($1,$2,$3) ON CONFLICT (slug) DO NOTHING`,
      [slug, title, body]
    );
  }

  const REVIEW_NAMES = ['Anitha M', 'Vikram D', 'Karthik B', 'Nisha T', 'Bookworm Salem'];
  const REVIEW_TEXTS = [
    'Good quality and useful. Happy with Salem Book House.',
    'Arrived well packed. Value for money.',
    'Exactly as described. Will buy again.',
    'Nice product for home and gifting.',
  ];
  const { rows: bare } = await query(
    `SELECT b.id, b.slug FROM books b
     WHERE NOT EXISTS (SELECT 1 FROM reviews r WHERE r.book_id = b.id)`
  );
  for (const book of bare) {
    const count = 8 + (book.id % 12);
    for (let i = 0; i < count; i++) {
      const rating = [5, 5, 5, 4, 4, 3][(book.id + i) % 6];
      await query(
        `INSERT INTO reviews (book_id, reviewer_name, rating, comment, created_at)
         VALUES ($1,$2,$3,$4, NOW() - ($5 || ' days')::interval)`,
        [
          book.id,
          REVIEW_NAMES[(book.id + i) % REVIEW_NAMES.length],
          rating,
          REVIEW_TEXTS[(book.id + i) % REVIEW_TEXTS.length],
          String((book.id * 3 + i) % 400),
        ]
      );
    }
  }

  console.log('Extra catalog, stores, pincodes, exams and admin user seeded');
  console.log('Admin: admin@salembookhouse.com / Admin@123');
}
