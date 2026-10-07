import { query } from '../db/pool.js';
import { createShipmentForOrder, shouldAutoCreate } from './index.js';
import { notifyOrderEvent } from '../notify/index.js';

async function loadOrderBundle(orderId) {
  const { rows } = await query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  if (!rows[0]) return null;
  const o = rows[0];
  const items = await query(
    `SELECT book_id AS "bookId", title, unit_price AS "unitPrice", quantity FROM order_items WHERE order_id = $1`,
    [orderId]
  );
  return {
    id: o.id,
    orderNumber: o.order_number,
    status: o.status,
    subtotal: Number(o.subtotal),
    total: Number(o.total),
    paymentMethod: o.payment_method,
    shippingName: o.shipping_name,
    shippingPhone: o.shipping_phone,
    shippingAddress: o.shipping_address,
    guestEmail: o.guest_email,
    createdAt: o.created_at,
    awb: o.awb,
    courier: o.courier,
    trackingUrl: o.tracking_url,
    items: items.rows,
  };
}

export async function shipOrder(orderId, { partnerCode, awb, trackingUrl, force } = {}) {
  const order = await loadOrderBundle(orderId);
  if (!order) throw new Error('Order not found');
  if (order.awb && !force && !awb) {
    return { order, skipped: true, message: 'Already has AWB' };
  }

  let result;
  if (awb) {
    result = {
      ok: true,
      carrier: partnerCode || order.courier || 'manual',
      awb,
      trackingUrl: trackingUrl || null,
      shipmentId: order.orderNumber,
    };
  } else {
    result = await createShipmentForOrder(order, partnerCode);
  }

  const nextStatus =
    result.awb || result.deferred ? (order.status === 'placed' ? 'confirmed' : order.status) : order.status;
  const shipStatus = result.awb ? 'shipped' : nextStatus;

  const { rows } = await query(
    `UPDATE orders SET
       awb = COALESCE($2, awb),
       courier = COALESCE($3, courier),
       tracking_url = COALESCE($4, tracking_url),
       carrier_shipment_id = COALESCE($5, carrier_shipment_id),
       shipped_at = CASE WHEN $2 IS NOT NULL THEN COALESCE(shipped_at, NOW()) ELSE shipped_at END,
       status = CASE WHEN $2 IS NOT NULL THEN 'shipped' ELSE status END,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      orderId,
      result.awb || null,
      result.carrier || partnerCode || null,
      result.trackingUrl || null,
      result.shipmentId || null,
    ]
  );

  const note = result.message
    || (result.awb
      ? `Shipment created via ${result.carrier}. AWB ${result.awb}`
      : `Shipment queued via ${result.carrier}`);
  await query(`INSERT INTO order_events (order_id, status, note) VALUES ($1,$2,$3)`, [
    orderId,
    result.awb ? 'shipped' : shipStatus,
    note,
  ]);

  const updated = await loadOrderBundle(orderId);
  await notifyOrderEvent({
    order: updated,
    event: result.awb ? 'Shipped' : 'Shipment update',
    note,
  });

  return { order: rows[0], result };
}

export async function maybeAutoShip(orderId) {
  try {
    const cfg = await shouldAutoCreate();
    if (!cfg.auto_create) return null;
    if (cfg.default_partner === 'manual') return null;
    return await shipOrder(orderId, { partnerCode: cfg.default_partner });
  } catch (err) {
    console.warn('auto-ship failed:', err.message || err);
    await query(`INSERT INTO order_events (order_id, status, note) VALUES ($1,'confirmed',$2)`, [
      orderId,
      `Auto-ship failed: ${err.message || err}`,
    ]).catch(() => {});
    return null;
  }
}

export async function applyTrackingWebhook({ carrier, awb, status, note, trackingUrl }) {
  if (!awb) throw new Error('AWB required');
  const { rows } = await query(`SELECT * FROM orders WHERE awb = $1`, [awb]);
  if (!rows[0]) throw new Error('Order not found for AWB');
  const map = {
    shipped: 'shipped',
    in_transit: 'shipped',
    out_for_delivery: 'out_for_delivery',
    ofd: 'out_for_delivery',
    delivered: 'delivered',
    rto: 'returned',
    cancelled: 'cancelled',
  };
  const next = map[String(status || '').toLowerCase()] || rows[0].status;
  await query(
    `UPDATE orders SET status = $2, tracking_url = COALESCE($3, tracking_url), courier = COALESCE($4, courier), updated_at = NOW()
     WHERE id = $1`,
    [rows[0].id, next, trackingUrl || null, carrier || null]
  );
  await query(`INSERT INTO order_events (order_id, status, note) VALUES ($1,$2,$3)`, [
    rows[0].id,
    next,
    note || `Carrier webhook: ${status}`,
  ]);
  const order = {
    ...rows[0],
    orderNumber: rows[0].order_number,
    guestEmail: rows[0].guest_email,
    shippingPhone: rows[0].shipping_phone,
    trackingUrl: trackingUrl || rows[0].tracking_url,
    awb,
  };
  await notifyOrderEvent({ order, event: next, note: note || status });
  return { orderId: rows[0].id, status: next };
}
