import { query } from '../db/pool.js';
import { quoteCheckout } from '../domain/checkout.js';
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
    payment.status === 'captured' &&
    Number(payment.amount) === expected
  );
}

/** Refund a captured Razorpay payment. Returns null when Razorpay is not configured. */
export async function refundRazorpayPayment(paymentId, amountRupees, receipt) {
  if (!razorpayEnabled() || !paymentId) return { skipped: true, reason: 'not_configured' };
  const rzp = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  const amount = Math.round(Number(amountRupees) * 100);
  // Reconcile an uncertain previous request by our durable receipt before retrying.
  if (receipt) {
    const existing = await rzp.payments.fetchMultipleRefund(paymentId, { count: 100 });
    const found = existing.items?.find(r => r.receipt === receipt);
    if (found) return { skipped:false, refundId:found.id, status:found.status };
  }
  const refund = await rzp.payments.refund(paymentId, {
    amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
    receipt,
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

router.post('/attempts/:id/check',payLimiter,optionalAuth,async(req,res)=>{
 try {
  const a=(await query('SELECT * FROM checkout_attempts WHERE id=$1',[req.params.id])).rows[0];
  if(!a || (a.user_id?a.user_id!==req.user?.id:a.session_id!==req.get('x-session-id')))return res.status(404).json({success:false,error:'Payment attempt not found'});
  const {recoverPayment}=await import('../domain/recovery.js');const result=await recoverPayment(a.id);
  const order=result.order_id?(await query('SELECT order_number FROM orders WHERE id=$1',[result.order_id])).rows[0]:null;
  return res.json({success:true,data:{id:a.id,status:result.status==='pending'?'unpaid':result.status,orderNumber:order?.order_number,message:result.error}});
 }catch(e){return res.status(400).json({success:false,error:'Unable to check payment. Please retry; do not pay again.'});}
});
router.post('/quote',payLimiter,optionalAuth,async(req,res)=>{
  try { return res.json({success:true,data:await quoteCheckout({...req.body,sessionId:req.body?.sessionId || req.get('x-session-id')},req.user)}); }
  catch(e){return res.status(400).json({success:false,error:e.message});}
});
router.post('/create-order', payLimiter, optionalAuth, async (req, res) => {
  try {
    const payload={sessionId:req.body?.sessionId || req.get('x-session-id'),shipping:req.body.shipping,addressId:req.body.addressId,guestEmail:req.body.guestEmail,couponCode:req.body.couponCode,giftCardCode:req.body.giftCardCode};
    if(payload.addressId && req.user){
      const a=(await query('SELECT * FROM addresses WHERE id=$1 AND user_id=$2',[payload.addressId,req.user.id])).rows[0];
      if(!a)throw new Error('Saved address not found');
      payload.shipping={fullName:a.full_name,phone:a.phone,line1:a.line1,line2:a.line2,city:a.city,state:a.state,pincode:a.pincode};delete payload.addressId;
    }
    const quote=await quoteCheckout(payload,req.user);
    const amount = Math.round(quote.total * 100);
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
    const attempt=await query('INSERT INTO checkout_attempts(user_id,session_id,payload,quote) VALUES($1,$2,$3,$4) RETURNING id',[req.user?.id || null,payload.sessionId,JSON.stringify(payload),JSON.stringify(quote)]);
    const order = await rzp.orders.create({
      amount,
      currency: 'INR',
      receipt: attempt.rows[0].id,
    });
    await query('UPDATE checkout_attempts SET gateway_order_id=$2 WHERE id=$1',[attempt.rows[0].id,order.id]);
    return res.json({
      success: true,
      data: { mode: 'razorpay', attemptId:attempt.rows[0].id, orderId: order.id, amount: order.amount, currency: order.currency, quote },
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

export async function fetchRazorpayRefund(id) {
  const rzp = new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET});
  const r=await rzp.refunds.fetch(id); return {refundId:r.id,status:r.status};
}
