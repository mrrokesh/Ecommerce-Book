import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db/pool.js';
import { mapBook } from '../utils/bookMapper.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let metaCache = null;
let homeCache = { at: 0, body: null };
const HOME_TTL_MS = 60_000;

function loadSeedMeta() {
  if (metaCache) return metaCache;
  try {
    const seedPath = path.join(__dirname, '../../../scraper/seed-data.json');
    const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    metaCache = {
      topCharts: data.topCharts || [],
      exams: data.exams || [],
      brand: data.brand || 'Salem Book House',
      tagline: data.tagline || "Salem's Favourite Book Mall",
    };
  } catch {
    metaCache = {
      topCharts: [
        { name: 'Kannada', slug: 'kannada' },
        { name: 'Young Adult', slug: 'young-adult' },
        { name: 'Fiction', slug: 'fiction' },
        { name: 'Non Fiction', slug: 'non-fiction' },
      ],
      exams: ['UPSC', 'Banking', 'Govt Exam', 'Engineering', 'Medical', 'Law'],
      brand: 'Salem Book House',
      tagline: "Salem's Favourite Book Mall",
    };
  }
  return metaCache;
}

function groupBooksBySlug(rows, slugs, limit) {
  const grouped = new Map(slugs.map((s) => [s, []]));
  for (const row of rows) {
    const list = grouped.get(row.cat_slug);
    if (!list || list.length >= limit) continue;
    list.push(mapBook(row));
  }
  return grouped;
}

router.get('/', async (_req, res) => {
  try {
    if (homeCache.body && Date.now() - homeCache.at < HOME_TTL_MS) {
      res.set('Cache-Control', 'public, max-age=30');
      return res.json(homeCache.body);
    }
    const meta = loadSeedMeta();

    const [bannersRes, sectionsRes, authorsRes, examsRes] = await Promise.all([
      query(
        `SELECT id, title, subtitle, cta, bg_color, text_color, link, image_url, sort_order
         FROM banners WHERE is_active = TRUE ORDER BY sort_order, id`
      ),
      query(
        `SELECT hs.id, hs.key, hs.title, hs.sort_order, c.slug AS category_slug
         FROM homepage_sections hs
         LEFT JOIN categories c ON c.id = hs.category_id
         WHERE hs.is_active = TRUE
         ORDER BY hs.sort_order, hs.id`
      ),
      query(
        `SELECT id, name, bio, image_url, featured
         FROM authors WHERE featured = TRUE
         ORDER BY name LIMIT 12`
      ),
      query(`SELECT name, slug, category FROM exams ORDER BY exam_date NULLS LAST LIMIT 12`),
    ]);

    const sectionSlugs = sectionsRes.rows.map((s) => s.category_slug || s.key).filter(Boolean);
    const chartSlugs = meta.topCharts.map((c) => c.slug).filter(Boolean);
    const allSlugs = [...new Set([...sectionSlugs, ...chartSlugs])];

    let bookRows = [];
    if (allSlugs.length) {
      const booksRes = await query(
        `SELECT * FROM (
           SELECT b.*, c.slug AS cat_slug,
             ROW_NUMBER() OVER (PARTITION BY c.slug ORDER BY b.discount_percent DESC, b.id) AS rn
           FROM books b
           JOIN book_categories bc ON bc.book_id = b.id
           JOIN categories c ON c.id = bc.category_id
           WHERE b.is_active = TRUE AND c.slug = ANY($1::text[])
         ) ranked
         WHERE rn <= 12`,
        [allSlugs]
      );
      bookRows = booksRes.rows;
    }

    const bySlug = groupBooksBySlug(bookRows, allSlugs, 12);

    const banners = bannersRes.rows.map((b) => ({
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      cta: b.cta,
      bgColor: b.bg_color,
      textColor: b.text_color,
      link: b.link,
      imageUrl: b.image_url && !/sapna/i.test(b.image_url) ? b.image_url : null,
    }));

    const homepageSections = sectionsRes.rows.map((s) => {
      const slug = s.category_slug || s.key;
      return {
        id: s.id,
        key: s.key,
        title: s.title,
        categorySlug: slug,
        books: bySlug.get(slug) || [],
      };
    });

    const featuredAuthors = authorsRes.rows.map((a) => ({
      id: a.id,
      name: a.name,
      bio: a.bio,
      imageUrl: a.image_url && !/sapna/i.test(a.image_url) ? a.image_url : null,
      featured: a.featured,
    }));

    const topCharts = meta.topCharts.map((chart) => ({
      name: chart.name,
      slug: chart.slug,
      books: (bySlug.get(chart.slug) || []).slice(0, 8),
    }));

    const exams =
      examsRes.rows.length > 0
        ? examsRes.rows.map((e) => ({ name: e.name, slug: e.slug, category: e.category }))
        : meta.exams;

    const body = {
      success: true,
      data: {
        brand: meta.brand,
        tagline: meta.tagline,
        banners,
        topCharts,
        homepageSections,
        featuredAuthors,
        exams,
      },
    };
    homeCache = { at: Date.now(), body };
    res.set('Cache-Control', 'public, max-age=30');
    return res.json(body);
  } catch (err) {
    console.error(err);
    const hung = /timeout|ECONNREFUSED|ENOTFOUND|terminat/i.test(String(err?.message || err));
    return res.status(503).json({
      success: false,
      error: hung
        ? 'Catalog database is unreachable. Start the Rokesh Cloud Postgres instance, then refresh.'
        : 'Failed to load homepage',
    });
  }
});

export default router;
