import { orderConfirmationEmail } from '../notify/accountMail.js';
import { firstError } from '../utils/validate.js';
import { transitionOrder } from '../domain/lifecycle.js';
import { canReturn } from '../domain/orderPolicy.js';
import { deliveryQuote } from '../domain/settings.js';
import crypto from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query, getPool } from '../db/pool.js';
import { optionalAuth, requireAuth, loadPermissions } from '../middleware/auth.js';
import { findActiveCoupon, couponDiscount, couponLimitError } from './coupons.js';
import {
  razorpayEnabled,
  verifyRazorpaySignature,
  verifyRazorpayPaymentAmount,
  refundRazorpayPayment,
} from './payments.js';
import { sendMail } from '../mailer.js';
import { emailVerificationRequired, VERIFY_BEFORE_ORDER_MESSAGE, codOrderCapReached } from '../utils/abuseGuard.js';
import { notifyOrderEvent } from '../notify/index.js';

const router = Router();
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many tracking attempts. Please wait and try again.' },
});
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many checkout attempts. Please wait and try again.' },
});

function customerActions(o) {
  const status = String(o.status || '');
  const canCancel = ['placed', 'confirmed', 'packed'].includes(status);
  return { canCancel, canReturn: canReturn(o,o.return_days || 7) };
}

function mapOrder(o, items = [], events = [], giftCodes = []) {
  const actions = customerActions(o);
  return {
    id: o.id,
    orderNumber: o.order_number,
    status: o.status,
    subtotal: Number(o.subtotal),
    discount: Number(o.discount),
    shipping: Number(o.shipping),
    total: Number(o.total),
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    shippingName: o.shipping_name,
    shippingPhone: o.shipping_phone,
    shippingAddress: o.shipping_address,
    guestEmail: o.guest_email || null,
    awb: o.awb || null,
    courier: o.courier || null,
    trackingUrl: o.tracking_url || null,
    shippedAt: o.shipped_at || null,
    invoiceNumber: o.invoice_number || null,
    createdAt: o.created_at,
    items,
    events,
    giftCodes,
    canCancel: actions.canCancel,
    canReturn: actions.canReturn,
  };
}

function mapItems(rows) {
  return rows.map((it) => ({
    id: it.id,
    bookId: it.book_id,
    title: it.title,
    authorName: it.author_name,
    imageUrl: it.image_url,
    unitPrice: Number(it.unit_price),
    quantity: it.quantity,
    lineTotal: Number(it.line_total),
  }));
}

async function itemsForOrders(orderIds) {
  if (!orderIds.length) return new Map();
  const { rows } = await query(`SELECT * FROM order_items WHERE order_id = ANY($1::uuid[])`, [orderIds]);
  const map = new Map();
  for (const it of rows) {
    if (!map.has(it.order_id)) map.set(it.order_id, []);
    map.get(it.order_id).push(...mapItems([it]));
  }
  return map;
}

// Tracking is for signed-in customers and only covers their own orders.
router.get('/track', trackLimiter, requireAuth, async (req, res) => {
  try {
    const orderNumber = String(req.query.orderNumber || req.query.order || '').trim();
    if (!orderNumber) {
      return res.status(400).json({ success: false, error: 'Order number is required' });
    }

    const { rows } = await query(`SELECT * FROM orders WHERE order_number = $1 AND user_id = $2`, [
      orderNumber,
      req.user.id,
    ]);
    const o = rows[0];
    // Same 404 whether the order is missing or belongs to someone else.
    if (!o) return res.status(404).json({ success: false, error: 'Order not found in your account' });

    const itemsRes = await query(`SELECT * FROM order_items WHERE order_id = $1`, [o.id]);
    const eventsRes = await query(
      `SELECT status, note, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at`,
      [o.id]
    );
    return res.json({
      success: true,
      data: {
        order: mapOrder(
          o,
          mapItems(itemsRes.rows),
          eventsRes.rows.map((e) => ({ status: e.status, note: e.note, createdAt: e.created_at }))
        ),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to track order' });
  }
});

router.use(optionalAuth);

function orderNumber() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = crypto.randomInt(100000, 1000000);
  return `SBH-${stamp}-${rand}`;
}

export async function placeOrder(req, res) {
  if (emailVerificationRequired(req.user)) {
    return res.status(403).json({ success: false, code: 'EMAIL_NOT_VERIFIED', error: VERIFY_BEFORE_ORDER_MESSAGE });
  }
  if (String(req.body?.paymentMethod || 'cod').toLowerCase() === 'cod' && !req.body?.razorpayOrderId && (await codOrderCapReached())) {
    return res.status(429).json({ success: false, error: 'We are receiving a very high number of cash-on-delivery orders. Please pay online or try again later.' });
  }
  const client = await (await getPool()).connect();
  try {
    await client.query('BEGIN');

    const body = req.body || {};
    let attempt=null;
    if(body.razorpayOrderId){
      const ar=await client.query('SELECT * FROM checkout_attempts WHERE gateway_order_id=$1 FOR UPDATE',[body.razorpayOrderId]);
      attempt=ar.rows[0];
      if(!attempt || (attempt.user_id ? attempt.user_id!==req.user?.id : attempt.session_id!==body.sessionId)) throw new Error('Payment checkout does not belong to this session');
      Object.assign(body,attempt.payload,{paymentMethod:'razorpay'});
      if(['refunded','refund_pending'].includes(attempt.status))throw new Error('This payment is being refunded.');
      if(attempt.order_id){
        const existing=await client.query('SELECT * FROM orders WHERE id=$1',[attempt.order_id]);
        await client.query('COMMIT');return res.json({success:true,data:{order:mapOrder(existing.rows[0])}});
      }
    }
    const shipping = body.shipping || {};
    let shippingName = (body.shippingName || shipping.fullName || '').trim();
    let shippingPhone = (body.shippingPhone || shipping.phone || '').trim();
    let shippingAddress = (body.shippingAddress || '').trim();
    const paymentMethod = String(body.paymentMethod || 'cod').toLowerCase();
    const sessionId = body.sessionId;
    const addressId = body.addressId;
    const guestEmail = String(body.guestEmail || shipping.email || '').trim().toLowerCase();
    if (!req.user && !guestEmail) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Email is required for guest checkout' });
    }
    {
      const bad = firstError([
        ['email', guestEmail, 'Email', { skipEmpty: true }],
        ...(addressId ? [] : [
          ['name', shippingName, 'Name'],
          ['phone', shippingPhone, 'Phone'],
          ['pincode', shipping.pincode, 'Pincode'],
          ['text', shipping.line1, 'Address line 1', { max: 200 }],
          ['text', shipping.city, 'City', { max: 80 }],
        ]),
      ]);
      if (bad) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: bad });
      }
    }

    if (addressId) {
      if (!req.user) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Sign in to use a saved address' });
      }
      const addr = await client.query(`SELECT * FROM addresses WHERE id = $1 AND user_id = $2`, [
        addressId,
        req.user.id,
      ]);
      if (!addr.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Saved address not found' });
      }
      const a = addr.rows[0];
      shippingName = a.full_name;
      shippingPhone = a.phone;
      shippingAddress = [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');
    } else if (!shippingAddress && (shipping.line1 || shipping.city)) {
      shippingAddress = [
        shipping.line1,
        shipping.line2,
        shipping.city,
        shipping.state,
        shipping.pincode,
      ]
        .filter(Boolean)
        .join(', ');
    }

    if (!shippingName || !shippingPhone || !shippingAddress) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'shippingName, shippingPhone and shippingAddress are required',
      });
    }

    const allowedPay = ['cod', 'upi', 'card', 'netbanking', 'razorpay'];
    if (!allowedPay.includes(paymentMethod)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Unsupported payment method' });
    }

    if (paymentMethod !== 'cod' && !razorpayEnabled() && process.env.NODE_ENV === 'production') {
      await client.query('ROLLBACK');
      return res.status(503).json({
        success: false,
        error: 'Online payments are temporarily unavailable. Please choose Cash on Delivery.',
      });
    }

    // Prefer user cart; optionally merge guest session cart
    let cart = null;
    if (req.user) {
      const cartRes = await client.query(`SELECT * FROM carts WHERE user_id = $1`, [req.user.id]);
      cart = cartRes.rows[0];
    }

    if (sessionId) {
      const guestRes = await client.query(`SELECT * FROM carts WHERE session_id = $1`, [sessionId]);
      const guest = guestRes.rows[0];
      if (guest) {
        if (!cart) {
          if (req.user) {
            await client.query(`UPDATE carts SET user_id = $1, session_id = NULL WHERE id = $2`, [
              req.user.id,
              guest.id,
            ]);
            const cartRes = await client.query(`SELECT * FROM carts WHERE id = $1`, [guest.id]);
            cart = cartRes.rows[0];
          } else {
            cart = guest;
          }
        } else if (guest.id !== cart.id) {
          const guestItems = await client.query(
            `SELECT book_id, quantity FROM cart_items WHERE cart_id = $1`,
            [guest.id]
          );
          for (const item of guestItems.rows) {
            await client.query(
              `INSERT INTO cart_items (cart_id, book_id, quantity)
               VALUES ($1, $2, $3)
               ON CONFLICT (cart_id, book_id) DO UPDATE
               SET quantity = cart_items.quantity + EXCLUDED.quantity`,
              [cart.id, item.book_id, item.quantity]
            );
          }
          await client.query(`DELETE FROM carts WHERE id = $1`, [guest.id]);
        }
      }
    }

    if (!cart && attempt) cart={id:null};
    if (!cart) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Cart is empty' });
    }

    // Serialise concurrent checkouts of the same cart: the second request waits here, then
    // finds the cart already emptied instead of ordering (and paying) twice.
    await client.query(`SELECT id FROM carts WHERE id = $1 FOR UPDATE`, [cart.id]);

    const itemsRes = attempt ? await client.query(
      'SELECT b.id AS book_id,b.title,b.author_name,b.image_url,b.stock,b.product_type,q.quantity,q.price AS sale_price FROM jsonb_to_recordset($1::jsonb) AS q(id int,quantity int,price numeric) JOIN books b ON b.id=q.id ORDER BY b.id',[JSON.stringify(attempt.quote.items)]
    ) : await client.query(
      `SELECT ci.quantity, b.id AS book_id, b.title, b.author_name, b.image_url, b.sale_price, b.stock, b.product_type, b.cod_allowed
       FROM cart_items ci
       JOIN books b ON b.id = ci.book_id
       WHERE ci.cart_id = $1 AND b.is_active = TRUE`,
      [cart.id]
    );

    if (!itemsRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Cart is empty' });
    }

    for (const item of itemsRes.rows) {
      if (item.stock < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for "${item.title}"`,
        });
      }
    }

    const subtotal = itemsRes.rows.reduce(
      (s, it) => s + Number(it.sale_price) * Number(it.quantity),
      0
    );
    let discount = 0;
    let couponCode = null;
    if (body.couponCode) {
      const coupon = await findActiveCoupon(body.couponCode);
      const limitErr = await couponLimitError(
        coupon,
        { userId: req.user?.id || null, email: req.user?.email || guestEmail, phone: shippingPhone },
        client
      );
      if (limitErr) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: limitErr });
      }
      // Gift cards are cash equivalents: a coupon must not make them cheaper than their face value.
      const discountable = itemsRes.rows.filter((it) => it.product_type !== 'gift-card').reduce((s, it) => s + Number(it.sale_price) * Number(it.quantity), 0);
      discount = couponDiscount(coupon, discountable);
      if (coupon && discount > 0) couponCode = coupon.code;
    }
    let giftApply = 0;
    let giftCardCode = null;
    const pinMatch = shippingAddress.match(/\b(\d{6})\b/);
    const enteredPin = String(shipping.pincode || '').trim();
    if (enteredPin && pinMatch && pinMatch[1] !== enteredPin) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'The pincode does not match the delivery address' });
    }
    const delivery = await deliveryQuote(enteredPin || pinMatch?.[1], subtotal - discount, (sql, params) => client.query(sql, params));
    const shippingFee = delivery.shipping;
    let total = Math.max(0, subtotal - discount + shippingFee);
    if (body.giftCardCode) {
      const gRes = await client.query(
        `SELECT * FROM gift_cards WHERE upper(code) = upper($1) AND status = 'active' FOR UPDATE`,
        [String(body.giftCardCode).trim()]
      );
      if (!gRes.rows[0] || Number(gRes.rows[0].remaining) <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Gift card is invalid or empty' });
      }
      giftApply = Math.min(total, Number(gRes.rows[0].remaining));
      giftCardCode = gRes.rows[0].code;
      total -= giftApply;
      const remaining = Number(gRes.rows[0].remaining) - giftApply;
      await client.query(
        `UPDATE gift_cards SET remaining = $1, status = $2 WHERE id = $3`,
        [remaining, remaining <= 0 ? 'used' : 'active', gRes.rows[0].id]
      );
      // Gift credit is a payment, not a merchandise discount.
    }
    if (paymentMethod !== 'cod' && razorpayEnabled() && total > 0) {
      const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Complete Razorpay payment first' });
      }
      if (!verifyRazorpaySignature({
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature,
      })) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Payment signature mismatch' });
      }
    }

    if (paymentMethod !== 'cod' && razorpayEnabled() && total > 0) {
      const dup = await client.query(`SELECT 1 FROM orders WHERE razorpay_payment_id = $1`, [
        body.razorpayPaymentId,
      ]);
      let amountOk = false;
      try {
        amountOk = await verifyRazorpayPaymentAmount({
          orderId: body.razorpayOrderId,
          paymentId: body.razorpayPaymentId,
          expectedRupees: total,
        });
      } catch (err) {
        console.warn('razorpay verify:', err?.message || err);
      }
      if (dup.rowCount || !amountOk) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'We could not verify this payment against your order total.',
        });
      }
    }
    if(attempt && JSON.stringify(attempt.quote.items.slice().sort((a,b)=>a.id-b.id)) !== JSON.stringify(itemsRes.rows.map(i=>({id:i.book_id,quantity:i.quantity,price:Number(i.sale_price)})).sort((a,b)=>a.id-b.id))) throw new Error('Your cart changed after payment. Payment is recorded for staff recovery; do not pay again.');
    if(attempt && Number(attempt.quote.total)!==Math.round(total*100)/100) throw new Error('Checkout total changed. Your payment is recorded for recovery; do not pay again.');
    const onum = orderNumber();
    const online = paymentMethod !== 'cod';
    const fullyCovered = total <= 0;
    const paymentStatus = online || fullyCovered ? 'paid' : 'pending';
    const status = online || fullyCovered ? 'confirmed' : 'placed';
    const storeMethod = fullyCovered && paymentMethod === 'cod' ? 'gift_card' : paymentMethod;

    // Some products are sold online-payment-only. Cash on delivery is refused for them unless a gift card covers everything.
    if (paymentMethod === 'cod' && !fullyCovered) {
      const noCod = itemsRes.rows.filter((i) => i.cod_allowed === false).map((i) => i.title);
      if (noCod.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Cash on delivery is not available for: ${noCod.slice(0, 3).join(', ')}${noCod.length > 3 ? ' and more' : ''}. Please pay online.`,
        });
      }
    }

    // Gift-card value must only be issued against settled money, never on unpaid cash-on-delivery.
    if (itemsRes.rows.some((it) => it.product_type === 'gift-card') && paymentStatus !== 'paid') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Gift cards must be paid for online. Please choose UPI, card or net banking.',
      });
    }

    const orderRes = await client.query(
      `INSERT INTO orders (
         order_number, user_id, status, subtotal, discount, shipping, total,
         payment_method, payment_status, shipping_name, shipping_phone, shipping_address,
         guest_email, coupon_code, gift_card_code, razorpay_order_id, razorpay_payment_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        onum,
        req.user?.id || null,
        status,
        subtotal,
        discount,
        shippingFee,
        total,
        storeMethod,
        paymentStatus,
        shippingName.trim(),
        shippingPhone.trim(),
        shippingAddress.trim(),
        req.user ? null : guestEmail,
        couponCode,
        giftCardCode,
        body.razorpayOrderId || null,
        body.razorpayPaymentId || null,
      ]
    );
    const order = orderRes.rows[0];
    await client.query('UPDATE orders SET gift_credit=$2,return_days=$3 WHERE id=$1',[order.id,giftApply,delivery.returnDays]);
    if (giftApply) await client.query('INSERT INTO gift_transactions(code,order_id,amount,reason) VALUES($1,$2,$3,$4)',[giftCardCode,order.id,-giftApply,'checkout']);
    await client.query(`INSERT INTO order_events (order_id, status, note) VALUES ($1,$2,$3)`, [
      order.id,
      status,
      fullyCovered
        ? 'Paid with gift card / coupon.'
        : paymentMethod === 'cod'
          ? 'Order placed. Pay cash on delivery.'
          : razorpayEnabled()
            ? `Razorpay payment ${body.razorpayPaymentId}`
            : `Simulated ${paymentMethod.toUpperCase()} payment captured.`,
    ]);

    for (const item of itemsRes.rows) {
      const unit = Number(item.sale_price);
      const qty = Number(item.quantity);
      await client.query(
        `INSERT INTO order_items (
           order_id, book_id, title, author_name, image_url, unit_price, quantity, line_total
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          order.id,
          item.book_id,
          item.title,
          item.author_name,
          item.image_url,
          unit,
          qty,
          unit * qty,
        ]
      );
      await client.query('INSERT INTO stock_movements(book_id,delta,reason,order_id) VALUES($1,$2,$3,$4)',[item.book_id,-qty,'sale',order.id]);
      // Guarded decrement so two concurrent checkouts can't oversell the same stock.
      const dec = await client.query(
        `UPDATE books SET stock = stock - $1 WHERE id = $2 AND stock >= $1`,
        [qty, item.book_id]
      );
      if (!dec.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: `"${item.title}" just sold out. Update your cart and try again.`,
        });
      }
    }

    const giftCodes = [];
    for (const item of itemsRes.rows) {
      if (item.product_type === 'gift-card') {
        for (let n = 0; n < Number(item.quantity); n++) {
          const code = `SBH-${crypto.randomBytes(8).toString('hex').toUpperCase().match(/.{4}/g).join('-')}`; // 64 bits, grouped for readability
          const amount = Number(item.sale_price);
          await client.query(
            `INSERT INTO gift_cards (code, amount, remaining, buyer_email, order_id) VALUES ($1,$2,$2,$3,$4)`,
            [code, amount, req.user?.email || guestEmail, order.id]
          );
          giftCodes.push({ code, amount });
        }
      }
    }

    if(attempt){
      for(const item of itemsRes.rows){
        const existing=await client.query('SELECT quantity FROM cart_items WHERE cart_id=$1 AND book_id=$2 FOR UPDATE',[cart.id,item.book_id]);
        if(existing.rows[0]?.quantity>item.quantity)await client.query('UPDATE cart_items SET quantity=quantity-$3 WHERE cart_id=$1 AND book_id=$2',[cart.id,item.book_id,item.quantity]);
        else await client.query('DELETE FROM cart_items WHERE cart_id=$1 AND book_id=$2',[cart.id,item.book_id]);
      }
    }else await client.query('DELETE FROM cart_items WHERE cart_id=$1',[cart.id]);
    const invNo = `INV-${onum.replace('SBH-', '')}`;
    await client.query(`UPDATE orders SET invoice_number = $2 WHERE id = $1`, [order.id, invNo]);
    order.invoice_number = invNo;
    if(attempt) await client.query("UPDATE checkout_attempts SET order_id=$2,payment_id=$3,status='completed',error=NULL WHERE id=$1",[attempt.id,order.id,body.razorpayPaymentId]);
    await client.query('COMMIT');

    orderConfirmationEmail(order.id, { giftCodes });

    // Fire-and-forget auto shipment when a live courier is configured.
    import('../shipping/service.js')
      .then(({ maybeAutoShip }) => maybeAutoShip(order.id))
      .catch(() => {});

    return res.status(201).json({
      success: true,
      data: {
        order: mapOrder(order, [], [], giftCodes),
      },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    if (err?.code === '23505' && /razorpay_payment_id/.test(String(err.constraint || err.detail || ''))) {
      return res.status(409).json({
        success: false,
        error: 'This payment has already been used for an order.',
      });
    }
    console.error(err);
    return res.status(500).json({ success: false, error: 'Checkout failed' });
  } finally {
    client.release();
  }
}
router.post('/', checkoutLimiter, placeOrder);

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    const itemMap = await itemsForOrders(rows.map((o) => o.id));
    const orders = rows.map((o) => mapOrder(o, itemMap.get(o.id) || []));
    return res.json({ success: true, data: { orders } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    const o = rows[0];
    const itemsRes = await query(`SELECT * FROM order_items WHERE order_id = $1`, [o.id]);
    const eventsRes = await query(
      `SELECT status, note, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at`,
      [o.id]
    );
    return res.json({
      success: true,
      data: {
        order: mapOrder(
          o,
          mapItems(itemsRes.rows),
          eventsRes.rows.map((e) => ({ status: e.status, note: e.note, createdAt: e.created_at }))
        ),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch order' });
  }
});

export async function restockOrder(client, orderId) {
  const items = await client.query(
    `SELECT book_id, quantity FROM order_items WHERE order_id = $1 AND book_id IS NOT NULL`,
    [orderId]
  );
  for (const it of items.rows) {
    await client.query(`UPDATE books SET stock = stock + $1 WHERE id = $2`, [it.quantity, it.book_id]);
  }
}

/**
 * Void gift cards issued by an order that is being cancelled or refunded.
 * Returns true (and changes nothing) when any of them was already spent, so the caller can refuse.
 */
export async function voidOrderGiftCards(client, orderId) {
  const { rows } = await client.query(
    `SELECT id, amount, remaining FROM gift_cards WHERE order_id = $1 FOR UPDATE`,
    [orderId]
  );
  if (rows.some((g) => Number(g.remaining) < Number(g.amount))) return true;
  if (rows.length) {
    await client.query(`UPDATE gift_cards SET status = 'void', remaining = 0 WHERE order_id = $1`, [orderId]);
  }
  return false;
}

export function nextPaymentStatus(order, kind) {
  if (kind === 'cancel' || kind === 'return') {
    if (order.payment_method === 'cod' && order.payment_status !== 'paid') return 'cancelled';
    if (order.payment_status === 'paid' || order.payment_status === 'refunded') return 'refunded';
  }
  return order.payment_status;
}

async function loadOwnedOrder(req, res) {
  const { rows } = await query(`SELECT * FROM orders WHERE id = $1 AND user_id = $2`, [
    req.params.id,
    req.user.id,
  ]);
  if (!rows[0]) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return null;
  }
  return rows[0];
}

router.patch('/:id/cancel', requireAuth, async (req, res) => {
  const client = await (await getPool()).connect();
  try {
    const order = await loadOwnedOrder(req, res);
    if (!order) return;
    if (!customerActions(order).canCancel) {
      return res.status(400).json({
        success: false,
        error: 'This order can no longer be cancelled. It has already been dispatched.',
      });
    }
    const reason = String(req.body?.reason || '').trim().slice(0, 400);
    await client.query('BEGIN');
    // Re-read under a row lock so overlapping cancels are serialised and judged on the current state.
    const lockedRes = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [order.id, req.user.id]
    );
    const current = lockedRes.rows[0];
    if (!current || !customerActions(current).canCancel) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'This order can no longer be cancelled. It has already been dispatched or cancelled.',
      });
    }
    await transitionOrder(client,current,'cancelled',{actor:req.user,note:reason || 'Cancelled by customer'});
    const {rows}=await client.query('SELECT * FROM orders WHERE id=$1',[order.id]);
    await client.query('COMMIT');
    notifyOrderEvent({
      order: { ...rows[0], orderNumber: rows[0].order_number, guestEmail: rows[0].guest_email, shippingPhone: rows[0].shipping_phone },
      event: 'Cancelled',
      note: reason || 'Order cancelled',
    }).catch(() => {});
    const itemsRes = await query(`SELECT * FROM order_items WHERE order_id = $1`, [order.id]);
    const eventsRes = await query(
      `SELECT status, note, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at`,
      [order.id]
    );
    return res.json({
      success: true,
      data: {
        order: mapOrder(
          rows[0],
          mapItems(itemsRes.rows),
          eventsRes.rows.map((e) => ({ status: e.status, note: e.note, createdAt: e.created_at }))
        ),
      },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not cancel order' });
  } finally {
    client.release();
  }
});

router.patch('/:id/return', requireAuth, async (req, res) => {
  const client = await (await getPool()).connect();
  try {
    const order = await loadOwnedOrder(req, res);
    if (!order) return;
    if (order.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        error: 'Returns are available only after the order is delivered.',
      });
    }
    if (!customerActions(order).canReturn) {
      return res.status(400).json({
        success: false,
        error: 'The 7-day return window has closed.',
      });
    }
    const reason = String(req.body?.reason || '').trim().slice(0, 400);
    if (!reason) {
      return res.status(400).json({ success: false, error: 'Tell us why you want to return this order' });
    }
    await client.query('BEGIN');
    const locked = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[order.id]);
    if (!customerActions(locked.rows[0]).canReturn) throw new Error('This order is no longer eligible for return');
    await transitionOrder(client,locked.rows[0],'return_requested',{actor:req.user,note:reason});
    const {rows}=await client.query('SELECT * FROM orders WHERE id=$1',[order.id]);
    await client.query('COMMIT');
    notifyOrderEvent({
      order: {
        ...rows[0],
        orderNumber: rows[0].order_number,
        guestEmail: rows[0].guest_email,
        shippingPhone: rows[0].shipping_phone,
      },
      event: 'Return requested',
      note: reason,
    }).catch(() => {});
    const itemsRes = await query(`SELECT * FROM order_items WHERE order_id = $1`, [order.id]);
    const eventsRes = await query(
      `SELECT status, note, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at`,
      [order.id]
    );
    return res.json({
      success: true,
      data: {
        order: mapOrder(
          rows[0],
          mapItems(itemsRes.rows),
          eventsRes.rows.map((e) => ({ status: e.status, note: e.note, createdAt: e.created_at }))
        ),
      },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not start return' });
  } finally {
    client.release();
  }
});

router.get('/:id/invoice', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM orders WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Order not found' });
    const o = rows[0];
    const ownerOk =
      req.user.id === o.user_id || (await loadPermissions(req.user)).includes('orders');
    if (!ownerOk) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    const items = await query(`SELECT * FROM order_items WHERE order_id = $1`, [o.id]);
    const { renderInvoiceHtml } = await import('../invoice/pdf.js');
    const html = renderInvoiceHtml(o, items.rows);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Content-Disposition', `inline; filename="${o.invoice_number || o.order_number}.html"`);
    return res.send(html);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Invoice failed' });
  }
});

export default router;
