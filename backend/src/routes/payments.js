import crypto from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Razorpay from 'razorpay';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();
const payLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many payment requests. Please wait and try again.' },
});

export function razorpayEnabled() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Confirm with Razorpay that the payment belongs to the order and covers the amount. */
export async function verifyRazorpayPaymentAmount({ orderId, paymentId, expectedRupees }) {
  const rzp = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  const payment = await rzp.payments.fetch(paymentId);
  const expected = Math.round(Number(expectedRupees) * 100);
  return (
    payment.order_id === orderId &&
    ['captured', 'authorized'].includes(payment.status) &&
    Number(payment.amount) === expected
  );
}

/** Refund a captured Razorpay payment. Returns null when Razorpay is not configured. */
export async function refundRazorpayPayment(paymentId, amountRupees) {
  if (!razorpayEnabled() || !paymentId) return { skipped: true, reason: 'not_configured' };
  const rzp = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  const amount = Math.round(Number(amountRupees) * 100);
  const refund = await rzp.payments.refund(paymentId, {
    amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
  });
  return { skipped: false, refundId: refund.id, status: refund.status };
}

router.get('/config', (_req, res) => {
  const live = razorpayEnabled();
  return res.json({
    success: true,
    data: {
      mode: live ? 'razorpay' : 'simulated',
      keyId: live ? process.env.RAZORPAY_KEY_ID : null,
      currency: 'INR',
    },
  });
});

router.post('/create-order', payLimiter, optionalAuth, async (req, res) => {
  try {
    const amount = Math.round(Number(req.body?.amount) * 100);
    if (!Number.isFinite(amount) || amount < 100) {
      return res.status(400).json({ success: false, error: 'Amount must be at least ₹1' });
    }
    if (!razorpayEnabled()) {
      return res.json({
        success: true,
        data: {
          mode: 'simulated',
          orderId: `sim_${crypto.randomBytes(8).toString('hex')}`,
          amount,
          currency: 'INR',
        },
      });
    }
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const order = await rzp.orders.create({
      amount,
      currency: 'INR',
      receipt: `sbh_${Date.now()}`,
    });
    return res.json({
      success: true,
      data: { mode: 'razorpay', orderId: order.id, amount: order.amount, currency: order.currency },
    });
  } catch (err) {
    console.error('razorpay create-order:', err?.error?.description || err?.message || err);
    if (Number(err?.statusCode) === 401) {
      return res.status(401).json({ success: false, error: 'Payment gateway authentication failed' });
    }
    return res.status(500).json({ success: false, error: 'Could not create payment order' });
  }
});

/**
 * Standalone signature check: HMAC-SHA256(order_id|payment_id, KEY_SECRET).
 * Checkout re-verifies the same signature (and the amount) before an order is stored,
 * so this endpoint never marks anything paid; it only reports whether the signature is genuine.
 */
router.post('/verify', payLimiter, (req, res) => {
  const b = req.body || {};
  const orderId = b.razorpay_order_id ?? b.razorpayOrderId;
  const paymentId = b.razorpay_payment_id ?? b.razorpayPaymentId;
  const signature = b.razorpay_signature ?? b.razorpaySignature;
  if ([orderId, paymentId, signature].some((v) => typeof v !== 'string' || !v.trim())) {
    return res.status(400).json({
      success: false,
      error: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required',
    });
  }
  if (!razorpayEnabled()) {
    return res.status(503).json({ success: false, error: 'Online payments are not configured' });
  }
  if (!verifyRazorpaySignature({ orderId, paymentId, signature })) {
    return res.status(400).json({ success: false, error: 'Payment signature mismatch' });
  }
  return res.json({ success: true, data: { verified: true, orderId, paymentId } });
});

export default router;
