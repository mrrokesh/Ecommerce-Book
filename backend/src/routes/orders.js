import crypto from 'crypto';
import { Router } from 'express';
import { query, getPool } from '../db/pool.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { findActiveCoupon, couponDiscount } from './coupons.js';
import { razorpayEnabled, verifyRazorpaySignature, refundRazorpayPayment } from './payments.js';
import { sendMail } from '../mailer.js';
import { notifyOrderEvent } from '../notify/index.js';

const router = Router();

function customerActions(o) {
  const status = String(o.status || '');
  const canCancel = ['placed', 'confirmed', 'packed'].includes(status);
  let canReturn = status === 'delivered';
  if (canReturn) {
    const start = o.updated_at || o.created_at;
    const ageMs = Date.now() - new Date(start).getTime();
    canReturn = Number.isFinite(ageMs) && ageMs <= 7 * 24 * 60 * 60 * 1000;
  }
  return { canCancel, canReturn };
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

router.get('/track', optionalAuth, async (req, res) => {
  try {
    const orderNumber = String(req.query.orderNumber || req.query.order || '').trim();
    const phone = String(req.query.phone || '').trim();
    if (!orderNumber) {
      return res.status(400).json({ success: false, error: 'Order number is required' });
    }
    const { rows } = await query(`SELECT * FROM orders WHERE order_number = $1`, [orderNumber]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Order not found' });
    const o = rows[0];
    const owner = req.user && req.user.id === o.user_id;
    if (!owner && phone && o.shipping_phone.replace(/\D/g, '') !== phone.replace(/\D/g, '')) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    if (!owner && !phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required to track this order' });
    }
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
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SBH-${stamp}-${rand}`;
}

router.post('/', async (req, res) => {
  const client = await (await getPool()).connect();
  try {
    await client.query('BEGIN');

    const body = req.body || {};
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

    if (paymentMethod !== 'cod' && razorpayEnabled()) {
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

    if (!cart) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Cart is empty' });
    }

    const itemsRes = await client.query(
      `SELECT ci.quantity, b.id AS book_id, b.title, b.author_name, b.image_url, b.sale_price, b.stock, b.product_type
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
      discount = couponDiscount(coupon, subtotal);
      if (coupon && discount > 0) couponCode = coupon.code;
    }
    let giftApply = 0;
    let giftCardCode = null;
    const pinMatch = shippingAddress.match(/\b(\d{6})\b/);
    let shippingFee = subtotal - discount >= 499 ? 0 : 40;
    if (pinMatch) {
      const pinRes = await client.query(`SELECT shipping, eta_days FROM pincodes WHERE pincode = $1`, [
        pinMatch[1],
      ]);
      if (pinRes.rows[0] && subtotal - discount < 499) shippingFee = Number(pinRes.rows[0].shipping);
      else if (subtotal - discount >= 499) shippingFee = 0;
    }
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
      discount += giftApply;
    }
    const onum = orderNumber();
    const online = paymentMethod !== 'cod';
    const fullyCovered = total <= 0;
    const paymentStatus = online || fullyCovered ? 'paid' : 'pending';
    const status = online || fullyCovered ? 'confirmed' : 'placed';
    const storeMethod = fullyCovered && paymentMethod === 'cod' ? 'gift_card' : paymentMethod;

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
          const code = `SBH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
          const amount = Number(item.sale_price);
          await client.query(
            `INSERT INTO gift_cards (code, amount, remaining, buyer_email) VALUES ($1,$2,$2,$3)`,
            [code, amount, req.user?.email || guestEmail]
          );
          giftCodes.push({ code, amount });
        }
      }
    }

    await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cart.id]);
    const invNo = `INV-${onum.replace('SBH-', '')}`;
    await client.query(`UPDATE orders SET invoice_number = $2 WHERE id = $1`, [order.id, invNo]);
    order.invoice_number = invNo;
    await client.query('COMMIT');

    const notifyEmail = req.user?.email || guestEmail;
    if (notifyEmail) {
      const giftLine = giftCodes.length
        ? `\nGift card codes: ${giftCodes.map((g) => g.code).join(', ')}`
        : '';
      sendMail({
        to: notifyEmail,
        subject: `Salem Book House order ${onum}`,
        text: `Thank you. Order ${onum} total ₹${total}. Invoice ${invNo}. Track with this order number and phone ${shippingPhone}.${giftLine}`,
      }).catch(() => {});
    }

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
    console.error(err);
    return res.status(500).json({ success: false, error: 'Checkout failed' });
  } finally {
    client.release();
  }
});

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
    await restockOrder(client, order.id);
    const paymentStatus = nextPaymentStatus(order, 'cancel');
    const { rows } = await client.query(
      `UPDATE orders SET status = 'cancelled', payment_status = $1, stock_restored = TRUE, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [paymentStatus, order.id]
    );
    await client.query(`INSERT INTO order_events (order_id, status, note) VALUES ($1,'cancelled',$2)`, [
      order.id,
      reason ? `Cancelled by customer: ${reason}` : 'Cancelled by customer before dispatch. Stock restored.',
    ]);
    await client.query('COMMIT');
    if (paymentStatus === 'refunded' && order.razorpay_payment_id) {
      refundRazorpayPayment(order.razorpay_payment_id, order.total)
        .then((r) =>
          query(`INSERT INTO order_events (order_id, status, note) VALUES ($1,'cancelled',$2)`, [
            order.id,
            r.skipped ? 'Refund marked (Razorpay not configured).' : `Razorpay refund ${r.refundId}`,
          ])
        )
        .catch((err) => console.warn('refund:', err.message));
    }
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
    // Request first; admin/auto-approve restocks + refunds.
    const { rows } = await client.query(
      `UPDATE orders SET status = 'return_requested', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [order.id]
    );
    await client.query(`INSERT INTO order_events (order_id, status, note) VALUES ($1,'return_requested',$2)`, [
      order.id,
      `Return requested: ${reason}`,
    ]);
    // Auto-approve for client handoff: restock + refund immediately.
    await restockOrder(client, order.id);
    const paymentStatus = nextPaymentStatus(order, 'return');
    const final = await client.query(
      `UPDATE orders SET status = 'returned', payment_status = $1, stock_restored = TRUE, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [paymentStatus, order.id]
    );
    await client.query(`INSERT INTO order_events (order_id, status, note) VALUES ($1,'returned',$2)`, [
      order.id,
      'Return approved. Stock restored. Refund processing.',
    ]);
    await client.query('COMMIT');
    if (paymentStatus === 'refunded' && order.razorpay_payment_id) {
      refundRazorpayPayment(order.razorpay_payment_id, order.total)
        .then((r) =>
          query(`INSERT INTO order_events (order_id, status, note) VALUES ($1,'returned',$2)`, [
            order.id,
            r.skipped ? 'Refund marked (configure Razorpay for live refunds).' : `Razorpay refund ${r.refundId}`,
          ])
        )
        .catch((err) => console.warn('refund:', err.message));
    }
    notifyOrderEvent({
      order: {
        ...final.rows[0],
        orderNumber: final.rows[0].order_number,
        guestEmail: final.rows[0].guest_email,
        shippingPhone: final.rows[0].shipping_phone,
      },
      event: 'Return approved',
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
          final.rows[0],
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

router.get('/:id/invoice', optionalAuth, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM orders WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Order not found' });
    const o = rows[0];
    const ownerOk = req.user && (req.user.role === 'admin' || req.user.id === o.user_id);
    if (!ownerOk) {
      return res.status(403).json({ success: false, error: 'Sign in to download this invoice' });
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
