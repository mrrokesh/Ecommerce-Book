import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { optionalAuth } from '../middleware/auth.js';
import { mapBook } from '../utils/bookMapper.js';

const router = Router();

async function getOrCreateCart(req) {
  if (req.user) {
    let { rows } = await query(`SELECT * FROM carts WHERE user_id = $1`, [req.user.id]);
    if (!rows[0]) {
      ({ rows } = await query(
        `INSERT INTO carts (user_id) VALUES ($1) RETURNING *`,
        [req.user.id]
      ));
    }
    return rows[0];
  }

  let sessionId = req.headers['x-session-id'];
  if (!sessionId || typeof sessionId !== 'string') {
    sessionId = crypto.randomUUID();
  }
  sessionId = sessionId.slice(0, 80);

  let { rows } = await query(`SELECT * FROM carts WHERE session_id = $1`, [sessionId]);
  if (!rows[0]) {
    ({ rows } = await query(
      `INSERT INTO carts (session_id) VALUES ($1) RETURNING *`,
      [sessionId]
    ));
  }
  return { ...rows[0], _sessionId: sessionId };
}

async function loadCartPayload(cart) {
  const { rows } = await query(
    `SELECT ci.id AS cart_item_id, ci.quantity, ci.book_id,
            b.id, b.title, b.slug, b.author_name, b.image_url,
            b.mrp, b.sale_price, b.discount_percent, b.language, b.stock
     FROM cart_items ci
     JOIN books b ON b.id = ci.book_id
     WHERE ci.cart_id = $1
     ORDER BY ci.id`,
    [cart.id]
  );

  const items = rows.map((r) => {
    const book = mapBook(r, []);
    const quantity = Number(r.quantity);
    const unitPrice = Number(r.sale_price);
    return {
      id: r.cart_item_id,
      bookId: r.book_id,
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
      book,
    };
  });

  const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
  return {
    id: cart.id,
    sessionId: cart.session_id || cart._sessionId || null,
    items,
    itemCount: items.reduce((s, it) => s + it.quantity, 0),
    subtotal,
  };
}

router.use(optionalAuth);

router.get('/', async (req, res) => {
  try {
    const cart = await getOrCreateCart(req);
    const data = await loadCartPayload(cart);
    if (!req.user && data.sessionId) {
      res.setHeader('x-session-id', data.sessionId);
    }
    return res.json({ success: true, data: { cart: data } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to load cart' });
  }
});

router.post('/items', async (req, res) => {
  try {
    const bookId = Number(req.body?.bookId);
    const quantity = Math.max(1, Number(req.body?.quantity) || 1);
    if (!bookId) {
      return res.status(400).json({ success: false, error: 'bookId is required' });
    }

    const bookRes = await query(`SELECT id, stock FROM books WHERE id = $1 AND is_active = TRUE`, [
      bookId,
    ]);
    if (!bookRes.rows[0]) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    const cart = await getOrCreateCart(req);
    await query(
      `INSERT INTO cart_items (cart_id, book_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (cart_id, book_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
      [cart.id, bookId, quantity]
    );
    await query(`UPDATE carts SET updated_at = NOW() WHERE id = $1`, [cart.id]);

    const data = await loadCartPayload(cart);
    if (!req.user && data.sessionId) res.setHeader('x-session-id', data.sessionId);
    return res.status(201).json({ success: true, data: { cart: data } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to add to cart' });
  }
});

router.patch('/items/:id', async (req, res) => {
  try {
    const quantity = Number(req.body?.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) {
      return res.status(400).json({ success: false, error: 'quantity must be >= 1' });
    }

    const cart = await getOrCreateCart(req);
    const { rowCount } = await query(
      `UPDATE cart_items SET quantity = $1
       WHERE id = $2 AND cart_id = $3`,
      [quantity, req.params.id, cart.id]
    );
    if (!rowCount) {
      return res.status(404).json({ success: false, error: 'Cart item not found' });
    }
    await query(`UPDATE carts SET updated_at = NOW() WHERE id = $1`, [cart.id]);

    const data = await loadCartPayload(cart);
    if (!req.user && data.sessionId) res.setHeader('x-session-id', data.sessionId);
    return res.json({ success: true, data: { cart: data } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to update cart item' });
  }
});

router.delete('/items/:id', async (req, res) => {
  try {
    const cart = await getOrCreateCart(req);
    const { rowCount } = await query(
      `DELETE FROM cart_items WHERE id = $1 AND cart_id = $2`,
      [req.params.id, cart.id]
    );
    if (!rowCount) {
      return res.status(404).json({ success: false, error: 'Cart item not found' });
    }
    await query(`UPDATE carts SET updated_at = NOW() WHERE id = $1`, [cart.id]);

    const data = await loadCartPayload(cart);
    if (!req.user && data.sessionId) res.setHeader('x-session-id', data.sessionId);
    return res.json({ success: true, data: { cart: data } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to remove cart item' });
  }
});

export default router;
