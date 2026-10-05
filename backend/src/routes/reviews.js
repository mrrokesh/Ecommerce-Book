import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

export async function getReviewSummary(bookId) {
  const { rows } = await query(
    `SELECT
       COUNT(*)::int AS total,
       COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS average,
       COUNT(*) FILTER (WHERE rating = 5)::int AS star5,
       COUNT(*) FILTER (WHERE rating = 4)::int AS star4,
       COUNT(*) FILTER (WHERE rating = 3)::int AS star3,
       COUNT(*) FILTER (WHERE rating = 2)::int AS star2,
       COUNT(*) FILTER (WHERE rating = 1)::int AS star1
     FROM reviews WHERE book_id = $1`,
    [bookId]
  );
  const r = rows[0] || {};
  return {
    total: r.total || 0,
    average: Number(r.average) || 0,
    distribution: {
      5: r.star5 || 0,
      4: r.star4 || 0,
      3: r.star3 || 0,
      2: r.star2 || 0,
      1: r.star1 || 0,
    },
  };
}

export async function getReviewSummaries(bookIds) {
  const map = new Map();
  if (!bookIds.length) return map;
  const { rows } = await query(
    `SELECT book_id,
       COUNT(*)::int AS total,
       COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS average
     FROM reviews
     WHERE book_id = ANY($1::int[])
     GROUP BY book_id`,
    [bookIds]
  );
  for (const r of rows) {
    map.set(r.book_id, { total: r.total, average: Number(r.average) || 0 });
  }
  return map;
}

router.get('/book/:bookId', async (req, res) => {
  try {
    const bookId = Number(req.params.bookId);
    if (!bookId) return res.status(400).json({ success: false, error: 'Invalid book id' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const summary = await getReviewSummary(bookId);
    const { rows } = await query(
      `SELECT id, book_id, reviewer_name, rating, comment, created_at
       FROM reviews
       WHERE book_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [bookId, limit, offset]
    );

    return res.json({
      success: true,
      data: {
        summary,
        reviews: rows.map((r) => ({
          id: r.id,
          bookId: r.book_id,
          reviewerName: r.reviewer_name,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.created_at,
        })),
        pagination: { page, limit, total: summary.total },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to load reviews' });
  }
});

router.post('/', optionalAuth, async (req, res) => {
  try {
    const bookId = Number(req.body?.bookId);
    const rating = Number(req.body?.rating);
    const comment = String(req.body?.comment || '').trim();
    let reviewerName = String(req.body?.reviewerName || '').trim();

    if (!bookId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'bookId and rating (1-5) are required' });
    }
    if (comment.length < 5) {
      return res.status(400).json({ success: false, error: 'Please write at least a short review' });
    }

    const book = await query(`SELECT id FROM books WHERE id = $1 AND is_active = TRUE`, [bookId]);
    if (!book.rows[0]) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    if (req.user) {
      reviewerName = req.user.name;
    }
    if (!reviewerName) {
      return res.status(400).json({ success: false, error: 'Reviewer name is required' });
    }

    const { rows } = await query(
      `INSERT INTO reviews (book_id, user_id, reviewer_name, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, book_id, reviewer_name, rating, comment, created_at`,
      [bookId, req.user?.id || null, reviewerName, rating, comment]
    );

    const summary = await getReviewSummary(bookId);
    const r = rows[0];
    return res.status(201).json({
      success: true,
      data: {
        review: {
          id: r.id,
          bookId: r.book_id,
          reviewerName: r.reviewer_name,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.created_at,
        },
        summary,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to submit review' });
  }
});

// Keep requireAuth imported for future admin moderation routes
void requireAuth;

export default router;
