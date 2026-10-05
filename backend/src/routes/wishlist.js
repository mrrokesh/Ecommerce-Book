import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { mapBook } from '../utils/bookMapper.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT b.*, w.created_at AS wishlisted_at
       FROM wishlist w
       JOIN books b ON b.id = w.book_id
       WHERE w.user_id = $1 AND b.is_active = TRUE
       ORDER BY w.created_at DESC`,
      [req.user.id]
    );
    const books = rows.map((r) => ({
      ...mapBook(r, []),
      wishlistedAt: r.wishlisted_at,
    }));
    return res.json({ success: true, data: { books } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch wishlist' });
  }
});

router.post('/', async (req, res) => {
  try {
    const bookId = Number(req.body?.bookId);
    if (!bookId) {
      return res.status(400).json({ success: false, error: 'bookId is required' });
    }
    const bookRes = await query(`SELECT id FROM books WHERE id = $1 AND is_active = TRUE`, [bookId]);
    if (!bookRes.rows[0]) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }
    await query(
      `INSERT INTO wishlist (user_id, book_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.user.id, bookId]
    );
    return res.status(201).json({ success: true, data: { bookId } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to add to wishlist' });
  }
});

router.delete('/:bookId', async (req, res) => {
  try {
    const bookId = Number(req.params.bookId);
    await query(`DELETE FROM wishlist WHERE user_id = $1 AND book_id = $2`, [
      req.user.id,
      bookId,
    ]);
    return res.json({ success: true, data: { bookId } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to remove from wishlist' });
  }
});

export default router;
