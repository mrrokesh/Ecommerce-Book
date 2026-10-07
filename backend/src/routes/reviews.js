import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth, optionalAuth, requireAdmin } from '../middleware/auth.js';

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
     FROM reviews WHERE book_id = $1 AND COALESCE(is_hidden, FALSE) = FALSE`,
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
     WHERE book_id = ANY($1::int[]) AND COALESCE(is_hidden, FALSE) = FALSE
     GROUP BY book_id`,
    [bookIds]
  );
  for (const r of rows) {
    map.set(r.book_id, { total: r.total, average: Number(r.average) || 0 });
  }
  return map;
}

function mapReview(r) {
  return {
    id: r.id,
    bookId: r.book_id,
    reviewerName: r.reviewer_name,
    rating: r.rating,
    comment: r.comment,
    isVerified: Boolean(r.is_verified),
    isHidden: Boolean(r.is_hidden),
    createdAt: r.created_at,
  };
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
      `SELECT * FROM reviews
       WHERE book_id = $1 AND COALESCE(is_hidden, FALSE) = FALSE
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [bookId, limit, offset]
    );
    return res.json({
      success: true,
      data: {
        summary,
        reviews: rows.map(mapReview),
        pagination: { page, limit, total: summary.total },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to load reviews' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const bookId = Number(req.body?.bookId);
    const rating = Number(req.body?.rating);
    const comment = String(req.body?.comment || '').trim();
    if (!bookId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'bookId and rating (1-5) are required' });
    }
    if (comment.length < 5) {
      return res.status(400).json({ success: false, error: 'Please write at least a short review' });
    }
    const book = await query(`SELECT id FROM books WHERE id = $1 AND is_active = TRUE`, [bookId]);
    if (!book.rows[0]) return res.status(404).json({ success: false, error: 'Book not found' });

    const purchased = await query(
      `SELECT o.id FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = $1 AND oi.book_id = $2 AND o.status = 'delivered'
       ORDER BY o.created_at DESC LIMIT 1`,
      [req.user.id, bookId]
    );
    if (!purchased.rows[0]) {
      return res.status(403).json({
        success: false,
        error: 'Only verified buyers can review this book after delivery.',
      });
    }
    const dup = await query(`SELECT id FROM reviews WHERE book_id = $1 AND user_id = $2`, [
      bookId,
      req.user.id,
    ]);
    if (dup.rows[0]) {
      return res.status(409).json({ success: false, error: 'You already reviewed this book' });
    }

    const { rows } = await query(
      `INSERT INTO reviews (book_id, user_id, reviewer_name, rating, comment, is_verified, order_id)
       VALUES ($1,$2,$3,$4,$5,TRUE,$6)
       RETURNING *`,
      [bookId, req.user.id, req.user.name || 'Reader', rating, comment, purchased.rows[0].id]
    );
    const summary = await getReviewSummary(bookId);
    return res.status(201).json({
      success: true,
      data: { review: mapReview(rows[0]), summary },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to submit review' });
  }
});

router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.*, b.title AS book_title FROM reviews r
       LEFT JOIN books b ON b.id = r.book_id
       ORDER BY r.created_at DESC LIMIT 200`
    );
    return res.json({
      success: true,
      data: {
        reviews: rows.map((r) => ({ ...mapReview(r), bookTitle: r.book_title })),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to list reviews' });
  }
});

router.patch('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const hidden = Boolean(req.body?.isHidden);
    const { rows } = await query(
      `UPDATE reviews SET is_hidden = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, hidden]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, data: { review: mapReview(rows[0]) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update review' });
  }
});

void optionalAuth;

export default router;
