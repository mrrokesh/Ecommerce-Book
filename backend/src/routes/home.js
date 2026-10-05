import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db/pool.js';
import { fetchBooksByCategorySlug } from './books.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSeedMeta() {
  try {
    const seedPath = path.join(__dirname, '../../../scraper/seed-data.json');
    const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    return {
      topCharts: data.topCharts || [],
      exams: data.exams || [],
      brand: data.brand || 'Salem Book House',
      tagline: data.tagline || "Salem's Favourite Book Mall",
    };
  } catch {
    return {
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
}

router.get('/', async (_req, res) => {
  try {
    const meta = loadSeedMeta();

    const bannersRes = await query(
      `SELECT id, title, subtitle, cta, bg_color, text_color, link, image_url, sort_order
       FROM banners WHERE is_active = TRUE ORDER BY sort_order, id`
    );
    const banners = bannersRes.rows.map((b) => ({
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      cta: b.cta,
      bgColor: b.bg_color,
      textColor: b.text_color,
      link: b.link,
      imageUrl: b.image_url,
    }));

    const sectionsRes = await query(
      `SELECT hs.id, hs.key, hs.title, hs.sort_order, c.slug AS category_slug
       FROM homepage_sections hs
       LEFT JOIN categories c ON c.id = hs.category_id
       WHERE hs.is_active = TRUE
       ORDER BY hs.sort_order, hs.id`
    );

    const homepageSections = [];
    for (const s of sectionsRes.rows) {
      const slug = s.category_slug || s.key;
      const books = await fetchBooksByCategorySlug(slug, 12);
      homepageSections.push({
        id: s.id,
        key: s.key,
        title: s.title,
        categorySlug: slug,
        books,
      });
    }

    const authorsRes = await query(
      `SELECT id, name, bio, image_url, featured
       FROM authors WHERE featured = TRUE
       ORDER BY name LIMIT 12`
    );
    const featuredAuthors = authorsRes.rows.map((a) => ({
      id: a.id,
      name: a.name,
      bio: a.bio,
      imageUrl: a.image_url,
      featured: a.featured,
    }));

    // Enrich top charts with book counts / sample books
    const topCharts = [];
    for (const chart of meta.topCharts) {
      const books = await fetchBooksByCategorySlug(chart.slug, 8);
      topCharts.push({
        name: chart.name,
        slug: chart.slug,
        books,
      });
    }

    const examsRes = await query(
      `SELECT name, slug, category FROM exams ORDER BY exam_date NULLS LAST LIMIT 12`
    );
    const exams =
      examsRes.rows.length > 0
        ? examsRes.rows.map((e) => ({ name: e.name, slug: e.slug, category: e.category }))
        : meta.exams;

    return res.json({
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
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to load homepage' });
  }
});

export default router;
