import { Router } from 'express';
import { query } from '../db/pool.js';
import { mapBook } from '../utils/bookMapper.js';
import { getReviewSummaries } from './reviews.js';

const router = Router();

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

router.get('/', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT publisher, COUNT(*)::int AS book_count
       FROM books
       WHERE is_active = TRUE AND publisher IS NOT NULL AND publisher <> ''
       GROUP BY publisher
       ORDER BY book_count DESC, publisher
       LIMIT 80`
    );
    return res.json({
      success: true,
      data: {
        publishers: rows.map((r) => ({
          name: r.publisher,
          slug: slugify(r.publisher),
          bookCount: r.book_count,
        })),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch publishers' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM books WHERE is_active = TRUE AND publisher IS NOT NULL`
    );
    const match = rows.filter((b) => slugify(b.publisher) === req.params.slug);
    if (!match.length) return res.status(404).json({ success: false, error: 'Publisher not found' });
    const ratings = await getReviewSummaries(match.map((b) => b.id));
    return res.json({
      success: true,
      data: {
        publisher: { name: match[0].publisher, slug: req.params.slug },
        books: match.map((b) => mapBook(b, [], ratings.get(b.id) || null)),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch publisher' });
  }
});

export default router;
