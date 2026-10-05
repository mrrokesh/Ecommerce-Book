import { Router } from 'express';
import { query } from '../db/pool.js';
import { mapBook } from '../utils/bookMapper.js';
import { getReviewSummaries } from './reviews.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const featured = String(req.query.featured || '') === 'true';
    const { rows } = await query(
      `SELECT a.id, a.name, a.bio, a.image_url, a.featured, COUNT(b.id)::int AS book_count
       FROM authors a
       LEFT JOIN books b ON b.author_id = a.id AND b.is_active = TRUE
       ${featured ? 'WHERE a.featured = TRUE' : ''}
       GROUP BY a.id
       ORDER BY a.featured DESC, book_count DESC, a.name
       LIMIT 80`
    );
    return res.json({
      success: true,
      data: {
        authors: rows.map((a) => ({
          id: a.id,
          name: a.name,
          bio: a.bio,
          imageUrl: a.image_url,
          featured: a.featured,
          bookCount: a.book_count,
        })),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch authors' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, bio, image_url, featured FROM authors WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Author not found' });
    const booksRes = await query(
      `SELECT * FROM books WHERE author_id = $1 AND is_active = TRUE ORDER BY is_bestseller DESC, title`,
      [rows[0].id]
    );
    const ids = booksRes.rows.map((b) => b.id);
    const ratings = await getReviewSummaries(ids);
    return res.json({
      success: true,
      data: {
        author: {
          id: rows[0].id,
          name: rows[0].name,
          bio: rows[0].bio,
          imageUrl: rows[0].image_url,
          featured: rows[0].featured,
        },
        books: booksRes.rows.map((b) => mapBook(b, [], ratings.get(b.id) || null)),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch author' });
  }
});

export default router;
