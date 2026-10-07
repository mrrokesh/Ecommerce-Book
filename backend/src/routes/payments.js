import crypto from 'crypto';
import { Router } from 'express';
import Razorpay from 'razorpay';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

export function razorpayEnabled() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return expected === signature;
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

router.post('/create-order', optionalAuth, async (req, res) => {
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
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not create payment order' });
  }
});

export default router;
