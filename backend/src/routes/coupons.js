import { Router } from 'express';
import { query } from '../db/pool.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

export function couponDiscount(coupon, subtotal) {
  if (!coupon) return 0;
  const min = Number(coupon.min_order || coupon.minOrder || 0);
  if (subtotal < min) return 0;
  const pct = Number(coupon.percent_off || coupon.percentOff || 0);
  const amt = Number(coupon.amount_off || coupon.amountOff || 0);
  let off = amt;
  if (pct > 0) off = Math.round((subtotal * pct) / 100);
  return Math.min(subtotal, Math.max(0, off));
}

export async function findActiveCoupon(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  const { rows } = await query(
    `SELECT * FROM coupons
     WHERE upper(code) = $1 AND active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [c]
  );
  return rows[0] || null;
}

/**
 * Returns an error message when the coupon's total or per-customer limit is used up,
 * otherwise null. Cancelled/returned orders don't count. Pass a transaction client to
 * lock the coupon row so concurrent checkouts can't both take the last use.
 */
export async function couponLimitError(coupon, { userId = null, email = '' } = {}, client = null) {
  if (!coupon) return null;
  const run = (text, params) => (client ? client.query(text, params) : query(text, params));
  if (client) await client.query(`SELECT 1 FROM coupons WHERE id = $1 FOR UPDATE`, [coupon.id]);
  const live = `UPPER(coupon_code) = UPPER($1) AND status NOT IN ('cancelled','returned')`;
  if (coupon.usage_limit != null) {
    const { rows } = await run(`SELECT COUNT(*)::int AS c FROM orders WHERE ${live}`, [coupon.code]);
    if (rows[0].c >= Number(coupon.usage_limit)) return 'This coupon has been fully redeemed';
  }
  if (coupon.per_customer_limit != null && (userId || email)) {
    const { rows } = await run(
      `SELECT COUNT(*)::int AS c FROM orders
       WHERE ${live} AND (($2::uuid IS NOT NULL AND user_id = $2::uuid) OR ($3 <> '' AND lower(guest_email) = $3))`,
      [coupon.code, userId, String(email || '').toLowerCase()]
    );
    if (rows[0].c >= Number(coupon.per_customer_limit)) return 'You have already used this coupon';
  }
  return null;
}

router.post('/preview', optionalAuth, async (req, res) => {
  try {
    const subtotal = Number(req.body?.subtotal) || 0;
    const coupon = await findActiveCoupon(req.body?.code);
    if (!coupon) return res.status(404).json({ success: false, error: 'Invalid or expired coupon' });
    const limitErr = await couponLimitError(coupon, {
      userId: req.user?.id || null,
      email: req.user?.email || req.body?.email || '',
    });
    if (limitErr) return res.status(400).json({ success: false, error: limitErr });
    const discount = couponDiscount(coupon, subtotal);
    if (discount <= 0) {
      return res.status(400).json({
        success: false,
        error: `Add items worth ₹${Number(coupon.min_order)} or more to use this coupon`,
      });
    }
    return res.json({
      success: true,
      data: {
        code: coupon.code,
        description: coupon.description,
        discount,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not apply coupon' });
  }
});

router.post('/gift-preview', async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const due = Number(req.body?.amount) || 0;
    const { rows } = await query(
      `SELECT code, remaining, status FROM gift_cards WHERE upper(code) = $1`,
      [code]
    );
    if (!rows[0] || rows[0].status !== 'active' || Number(rows[0].remaining) <= 0) {
      return res.status(404).json({ success: false, error: 'Gift card not found or already used' });
    }
    const credit = Math.min(due, Number(rows[0].remaining));
    return res.json({
      success: true,
      data: { code: rows[0].code, remaining: Number(rows[0].remaining), credit },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not apply gift card' });
  }
});

export default router;
