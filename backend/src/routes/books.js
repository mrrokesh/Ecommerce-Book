import { Router } from 'express';
import { query } from '../db/pool.js';
import { mapBook } from '../utils/bookMapper.js';
import { getReviewSummary, getReviewSummaries } from './reviews.js';

const router = Router();

async function categoriesForBooks(bookIds) {
  if (!bookIds.length) return new Map();
  const { rows } = await query(
    `SELECT bc.book_id, c.id, c.name, c.slug
     FROM book_categories bc
     JOIN categories c ON c.id = bc.category_id
     WHERE bc.book_id = ANY($1::int[])
     ORDER BY c.sort_order, c.name`,
    [bookIds]
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.book_id)) map.set(r.book_id, []);
    map.get(r.book_id).push({ id: r.id, name: r.name, slug: r.slug });
  }
  return map;
}

async function mapBooksWithRatings(rows) {
  const ids = rows.map((r) => r.id);
  const catMap = await categoriesForBooks(ids);
  const ratingMap = await getReviewSummaries(ids);
  return rows.map((r) => mapBook(r, catMap.get(r.id) || [], ratingMap.get(r.id) || null));
}

export async function fetchBooksByCategorySlug(slug, limit = 12) {
  const { rows } = await query(
    `SELECT b.*
     FROM books b
     JOIN book_categories bc ON bc.book_id = b.id
     JOIN categories c ON c.id = bc.category_id
     WHERE c.slug = $1 AND b.is_active = TRUE
     ORDER BY b.discount_percent DESC, b.id
     LIMIT $2`,
    [slug, limit]
  );
  return mapBooksWithRatings(rows);
}

router.get('/', async (req, res) => {
  try {
    const {
      q = '',
      category,
      language,
      sort = 'relevance',
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const where = ['b.is_active = TRUE'];
    const params = [];
    let i = 1;

    if (q && String(q).trim()) {
      where.push(
        `(to_tsvector('english', b.title || ' ' || b.author_name) @@ plainto_tsquery('english', $${i})
         OR b.title ILIKE $${i + 1} OR b.author_name ILIKE $${i + 1} OR b.isbn13 = $${i + 2})`
      );
      const term = String(q).trim();
      params.push(term, `%${term}%`, term);
      i += 3;
    }

    if (category) {
      where.push(
        `EXISTS (
          SELECT 1 FROM book_categories bc
          JOIN categories c ON c.id = bc.category_id
          WHERE bc.book_id = b.id AND c.slug = $${i}
        )`
      );
      params.push(category);
      i++;
    }

    if (language) {
      where.push(`b.language ILIKE $${i}`);
      params.push(language);
      i++;
    }

    const minPrice = req.query.minPrice;
    const maxPrice = req.query.maxPrice;
    if (minPrice && Number.isFinite(Number(minPrice))) {
      where.push(`b.sale_price >= $${i}`);
      params.push(Number(minPrice));
      i++;
    }
    if (maxPrice && Number.isFinite(Number(maxPrice))) {
      where.push(`b.sale_price <= $${i}`);
      params.push(Number(maxPrice));
      i++;
    }

    let orderBy = 'b.id DESC';
    switch (String(sort)) {
      case 'price_asc':
        orderBy = 'b.sale_price ASC';
        break;
      case 'price_desc':
        orderBy = 'b.sale_price DESC';
        break;
      case 'discount':
        orderBy = 'b.discount_percent DESC';
        break;
      case 'title':
        orderBy = 'b.title ASC';
        break;
      case 'newest':
        orderBy = 'b.created_at DESC';
        break;
      default:
        orderBy = q ? 'b.discount_percent DESC, b.id DESC' : 'b.id DESC';
    }

    const whereSql = where.join(' AND ');
    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM books b WHERE ${whereSql}`,
      params
    );

    const listParams = [...params, limitNum, offset];
    const { rows } = await query(
      `SELECT b.* FROM books b
       WHERE ${whereSql}
       ORDER BY ${orderBy}
       LIMIT $${i} OFFSET $${i + 1}`,
      listParams
    );

    const books = await mapBooksWithRatings(rows);

    return res.json({
      success: true,
      data: {
        books,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: countRes.rows[0].total,
          totalPages: Math.ceil(countRes.rows[0].total / limitNum) || 0,
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch books' });
  }
});

router.get('/section/:slug', async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const books = await fetchBooksByCategorySlug(req.params.slug, limit);
    return res.json({ success: true, data: { slug: req.params.slug, books } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch section' });
  }
});

router.get('/:slugOrId', async (req, res) => {
  try {
    const { slugOrId } = req.params;
    const isId = /^\d+$/.test(slugOrId);
    const { rows } = await query(
      isId
        ? `SELECT * FROM books WHERE id = $1 AND is_active = TRUE`
        : `SELECT * FROM books WHERE slug = $1 AND is_active = TRUE`,
      [isId ? Number(slugOrId) : slugOrId]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    const bookRow = rows[0];
    const catMap = await categoriesForBooks([bookRow.id]);
    const summary = await getReviewSummary(bookRow.id);
    const book = mapBook(bookRow, catMap.get(bookRow.id) || [], {
      average: summary.average,
      total: summary.total,
    });
    const { rows: imageRows } = await query(
      `SELECT image_url FROM book_images WHERE book_id = $1 ORDER BY sort_order, id`,
      [bookRow.id]
    );
    book.images = imageRows.map((r) => r.image_url);
    if (!book.images.length && book.imageUrl) book.images = [book.imageUrl];

    // Similar books: shared category, else bestsellers
    let similarRows = [];
    const cats = catMap.get(bookRow.id) || [];
    if (cats.length) {
      const { rows: sim } = await query(
        `SELECT DISTINCT b.*
         FROM books b
         JOIN book_categories bc ON bc.book_id = b.id
         WHERE bc.category_id = ANY($1::int[])
           AND b.id <> $2
           AND b.is_active = TRUE
         ORDER BY b.is_bestseller DESC, b.discount_percent DESC, b.id
         LIMIT 12`,
        [cats.map((c) => c.id), bookRow.id]
      );
      similarRows = sim;
    }
    if (!similarRows.length) {
      const { rows: sim } = await query(
        `SELECT * FROM books
         WHERE id <> $1 AND is_active = TRUE
         ORDER BY is_bestseller DESC, discount_percent DESC
         LIMIT 12`,
        [bookRow.id]
      );
      similarRows = sim;
    }

    // From the author
    let authorRows = [];
    if (bookRow.author_id) {
      const { rows: auth } = await query(
        `SELECT * FROM books
         WHERE author_id = $1 AND id <> $2 AND is_active = TRUE
         ORDER BY is_bestseller DESC, title ASC
         LIMIT 12`,
        [bookRow.author_id, bookRow.id]
      );
      authorRows = auth;
    } else if (bookRow.author_name) {
      const { rows: auth } = await query(
        `SELECT * FROM books
         WHERE lower(author_name) = lower($1) AND id <> $2 AND is_active = TRUE
         ORDER BY is_bestseller DESC, title ASC
         LIMIT 12`,
        [bookRow.author_name, bookRow.id]
      );
      authorRows = auth;
    }

    const [similarBooks, fromAuthor] = await Promise.all([
      mapBooksWithRatings(similarRows),
      mapBooksWithRatings(authorRows),
    ]);

    // Recent reviews preview
    const { rows: reviewRows } = await query(
      `SELECT id, reviewer_name, rating, comment, created_at
       FROM reviews WHERE book_id = $1
       ORDER BY created_at DESC LIMIT 10`,
      [bookRow.id]
    );

    return res.json({
      success: true,
      data: {
        book,
        ratingSummary: summary,
        reviews: reviewRows.map((r) => ({
          id: r.id,
          reviewerName: r.reviewer_name,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.created_at,
        })),
        recommendations: {
          similar: similarBooks,
          fromAuthor,
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch book' });
  }
});

export default router;
