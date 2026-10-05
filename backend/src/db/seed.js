import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import bcrypt from 'bcryptjs';
import { getPool, query } from './pool.js';
import { seedExtras } from './extraSeed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function seedDatabase() {
  await getPool();

  const seedPath = path.join(__dirname, '../../../scraper/seed-data.json');
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Seed file not found: ${seedPath}. Run scraper/parse-scraped.js first.`);
  }

  const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  console.log(`Seeding Salem Book House from ${seedPath}`);
  console.log(`Brand: ${data.brand || 'Salem Book House'} — ${data.tagline || ''}`);

  // Demo user
  const passwordHash = await bcrypt.hash('Demo@123', 10);
  await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'customer')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name`,
    ['Demo User', 'demo@salembookhouse.com', passwordHash]
  );

  // Categories (two-pass for parent links)
  const categoryIdBySlug = new Map();
  const categories = data.categories || [];

  for (const cat of categories) {
    const { rows } = await query(
      `INSERT INTO categories (name, slug, badge, sort_order, image_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         badge = EXCLUDED.badge,
         sort_order = EXCLUDED.sort_order,
         image_url = COALESCE(EXCLUDED.image_url, categories.image_url)
       RETURNING id, slug`,
      [cat.name, cat.slug, cat.badge || null, cat.sortOrder ?? 0, cat.image || cat.imageUrl || null]
    );
    categoryIdBySlug.set(rows[0].slug, rows[0].id);
  }

  for (const cat of categories) {
    if (!cat.parent) continue;
    const parentId = categoryIdBySlug.get(cat.parent);
    const childId = categoryIdBySlug.get(cat.slug);
    if (parentId && childId) {
      await query(`UPDATE categories SET parent_id = $1 WHERE id = $2`, [parentId, childId]);
    }
  }

  // Ensure section slugs from books exist as categories
  for (const book of data.books || []) {
    for (const slug of book.sectionSlugs || []) {
      if (categoryIdBySlug.has(slug)) continue;
      const name = (book.sections || []).find((_, i) => book.sectionSlugs[i] === slug) || slug;
      const { rows } = await query(
        `INSERT INTO categories (name, slug, sort_order)
         VALUES ($1, $2, 100)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, slug`,
        [name, slug]
      );
      categoryIdBySlug.set(rows[0].slug, rows[0].id);
    }
  }

  // Authors from seed + book authors
  const authorIdByName = new Map();
  for (const author of data.authors || []) {
    const { rows } = await query(
      `INSERT INTO authors (name, bio, image_url, featured)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET
         bio = COALESCE(EXCLUDED.bio, authors.bio),
         image_url = COALESCE(EXCLUDED.image_url, authors.image_url),
         featured = EXCLUDED.featured OR authors.featured
       RETURNING id, name`,
      [author.name, author.bio || null, author.image || author.imageUrl || null, !!author.featured]
    );
    authorIdByName.set(rows[0].name.toLowerCase(), rows[0].id);
  }

  // Books
  let inserted = 0;
  let skipped = 0;
  const seenIsbn = new Set();

  for (const book of data.books || []) {
    const isbn13 = book.isbn13 || null;
    if (isbn13) {
      if (seenIsbn.has(isbn13)) {
        skipped++;
        continue;
      }
      seenIsbn.add(isbn13);
      const existing = await query(`SELECT id FROM books WHERE isbn13 = $1`, [isbn13]);
      if (existing.rows[0]) {
        skipped++;
        continue;
      }
    }

    let authorId = null;
    const authorName = (book.author || 'Unknown').replace(/\s+/g, ' ').trim() || 'Unknown';
    const authorKey = authorName.toLowerCase();
    if (authorIdByName.has(authorKey)) {
      authorId = authorIdByName.get(authorKey);
    } else {
      const { rows } = await query(
        `INSERT INTO authors (name, featured)
         VALUES ($1, FALSE)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, name`,
        [authorName]
      );
      authorId = rows[0].id;
      authorIdByName.set(authorKey, authorId);
    }

    const mrp = num(book.mrp, num(book.salePrice));
    const salePrice = num(book.salePrice, mrp);
    const discount =
      num(book.discountPercent) ||
      (mrp > salePrice ? Math.round(((mrp - salePrice) / mrp) * 100) : 0);

    let slug = book.slug || `${book.title}-${isbn13 || Date.now()}`;
    slug = String(slug)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 340);

    // unique slug
    const slugCheck = await query(`SELECT id FROM books WHERE slug = $1`, [slug]);
    if (slugCheck.rows[0]) {
      slug = `${slug}-${isbn13 || inserted + 1}`.slice(0, 340);
    }

    const isFeatured = (book.sectionSlugs || []).includes('featured-author') ||
      (book.sectionSlugs || []).includes('best-sellers');
    const isBestseller =
      (book.sectionSlugs || []).includes('best-sellers') ||
      (book.sectionSlugs || []).includes('fiction') ||
      (book.sectionSlugs || []).includes('non-fiction');

    const publishers = [
      'Salem Book House',
      'Penguin Random House',
      'HarperCollins',
      'Rupa Publications',
      'Westland',
      'Bloomsbury',
      'Orient Blackswan',
    ];
    const publisher =
      book.publisher ||
      publishers[(isbn13 ? Number(isbn13.slice(-2)) : book.title.length) % publishers.length];
    const year = 2015 + ((isbn13 ? Number(isbn13.slice(-3, -1)) : book.title.length) % 11);
    const edition = String(1 + ((isbn13 ? Number(isbn13.slice(-1)) : 1) % 12));

    const { rows } = await query(
      `INSERT INTO books (
         title, slug, author_id, author_name, isbn13, isbn10, description, image_url,
         mrp, sale_price, discount_percent, stock, language, publisher, binding,
         publishing_date, edition, is_featured, is_bestseller, source_url
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING id`,
      [
        book.title,
        slug,
        authorId,
        authorName,
        isbn13,
        book.isbn10 || null,
        book.description || `${book.title} by ${authorName}`,
        `/api/covers/${slug}.svg`,
        mrp,
        salePrice,
        discount,
        num(book.stock, 25),
        book.language || 'English',
        publisher,
        book.binding || 'Paper Back',
        String(year),
        edition,
        isFeatured,
        isBestseller,
        null,
      ]
    );

    const bookId = rows[0].id;
    const slugs = new Set(book.sectionSlugs || []);
    if (book.categorySlug) slugs.add(book.categorySlug);

    for (const s of slugs) {
      let catId = categoryIdBySlug.get(s);
      if (!catId) {
        const { rows: cRows } = await query(
          `INSERT INTO categories (name, slug, sort_order)
           VALUES ($1, $2, 100)
           ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
           RETURNING id, slug`,
          [s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), s]
        );
        catId = cRows[0].id;
        categoryIdBySlug.set(s, catId);
      }
      await query(
        `INSERT INTO book_categories (book_id, category_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [bookId, catId]
      );
    }

    inserted++;
  }

  // Banners — clear and reinsert for idempotent seed of promo content
  await query(`DELETE FROM banners`);
  let bannerOrder = 0;
  for (const banner of data.banners || []) {
    await query(
      `INSERT INTO banners (title, subtitle, cta, bg_color, text_color, link, image_url, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, TRUE)`,
      [
        banner.title,
        banner.subtitle || null,
        banner.cta || 'SHOP NOW',
        banner.bgColor || banner.bg_color || '#1e4d8c',
        banner.textColor || banner.text_color || '#ffffff',
        banner.link || '/shop',
        banner.image || banner.imageUrl || null,
        bannerOrder++,
      ]
    );
  }

  // Homepage sections
  let sectionOrder = 0;
  for (const section of data.homepageSections || []) {
    const catId = categoryIdBySlug.get(section.categorySlug) || null;
    await query(
      `INSERT INTO homepage_sections (key, title, category_id, sort_order, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (key) DO UPDATE SET
         title = EXCLUDED.title,
         category_id = EXCLUDED.category_id,
         sort_order = EXCLUDED.sort_order,
         is_active = TRUE`,
      [section.key, section.title, catId, sectionOrder++]
    );
  }

  // Enrich existing books that may lack specs / bestseller flags
  await query(
    `UPDATE books SET
       publisher = COALESCE(publisher, 'Salem Book House'),
       binding = COALESCE(binding, 'Paper Back'),
       publishing_date = COALESCE(publishing_date, '2020'),
       edition = COALESCE(edition, '1'),
       is_bestseller = CASE
         WHEN is_featured OR discount_percent >= 15 THEN TRUE
         ELSE is_bestseller
       END`
  );

  // Seed reviews if empty
  const reviewCount = await query(`SELECT COUNT(*)::int AS c FROM reviews`);
  if (reviewCount.rows[0].c === 0) {
    await seedReviews();
  }

  await seedExtras();

  const bookCount = await query(`SELECT COUNT(*)::int AS c FROM books`);
  console.log(`Seed complete: ${inserted} books inserted, ${skipped} duplicates skipped`);
  console.log(`Total books in DB: ${bookCount.rows[0].c}`);
  console.log('Demo user: demo@salembookhouse.com / Demo@123');
  return { inserted, skipped, total: bookCount.rows[0].c };
}

const REVIEW_NAMES = [
  'Priya S',
  'Arun Kumar',
  'Meena R',
  'Rahul V',
  'Lakshmi N',
  'Suresh P',
  'Anitha M',
  'Vikram D',
  'Deepa K',
  'Karthik B',
  'Nisha T',
  'Ganesh L',
  'Sowmya C',
  'Ravi Belagere Fan',
  'Bookworm Salem',
];

const REVIEW_TEXTS = [
  'Worth buying and reading this book. Excellent print and timely delivery from Salem Book House.',
  'A must-read. The content is engaging and the paper quality is good.',
  'Loved this title. Perfect for gifting and personal reading.',
  'Great book, arrived in perfect condition. Highly recommended.',
  'Readable and insightful. Value for money at this discount.',
  'One of my favourite titles. Happy with the purchase.',
  'Nice edition. Binding is solid and packaging was careful.',
  'Could not put it down. Will order more from this author.',
  'Good for students and casual readers alike.',
  'Authentic edition. Stars well deserved.',
  'Fast delivery to Salem and genuine product.',
  'Beautifully written. Will recommend to friends.',
];

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

async function seedReviews() {
  const { rows: books } = await query(`SELECT id, title, slug FROM books ORDER BY id`);
  let total = 0;
  for (const book of books) {
    const seed = hashSeed(book.slug || String(book.id));
    const count = 8 + (seed % 48); // 8–55 reviews per book
    for (let i = 0; i < count; i++) {
      const rSeed = hashSeed(`${book.id}-${i}`);
      // Bias toward 4–5 stars like Sapna screenshots
      const roll = rSeed % 100;
      let rating = 5;
      if (roll < 8) rating = 1;
      else if (roll < 16) rating = 2;
      else if (roll < 30) rating = 3;
      else if (roll < 55) rating = 4;
      else rating = 5;

      const name = REVIEW_NAMES[(rSeed >> 3) % REVIEW_NAMES.length];
      const comment = REVIEW_TEXTS[(rSeed >> 5) % REVIEW_TEXTS.length];
      const daysAgo = rSeed % 900;
      await query(
        `INSERT INTO reviews (book_id, reviewer_name, rating, comment, created_at)
         VALUES ($1, $2, $3, $4, NOW() - ($5 || ' days')::interval)`,
        [book.id, name, rating, comment, String(daysAgo)]
      );
      total++;
    }
  }
  console.log(`Seeded ${total} customer reviews across ${books.length} books`);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

export default seedDatabase;
