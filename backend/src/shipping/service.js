import { transitionOrder } from '../domain/lifecycle.js';
import { query, getPool } from '../db/pool.js';
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
  const lock=await (await getPool()).connect();
  try {
  await lock.query('BEGIN');
  await lock.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[orderId]);
  const order = await loadOrderBundle(orderId);
  if (!order) throw new Error('Order not found');
  if (!['placed','confirmed','packed'].includes(order.status)) throw new Error('Only unshipped active orders can create shipments');
  if (order.awb && !force && !awb) {
    await lock.query('COMMIT');
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

  const { rows } = await lock.query(
    `UPDATE orders SET
       awb = COALESCE($2, awb),
       courier = COALESCE($3, courier),
       tracking_url = COALESCE($4, tracking_url),
       carrier_shipment_id = COALESCE($5, carrier_shipment_id),
       shipped_at = CASE WHEN $2 IS NOT NULL THEN COALESCE(shipped_at, NOW()) ELSE shipped_at END,
       status = CASE WHEN $2 IS NOT NULL THEN 'shipped' ELSE status END,
       updated_at = NOW()
     WHERE id = $1 AND status IN ('placed','confirmed','packed')
     RETURNING *`,
    [
      orderId,
      result.awb || null,
      result.carrier || partnerCode || null,
      result.trackingUrl || null,
      result.shipmentId || null,
    ]
  );

  if (!rows[0]) throw new Error('Order changed during booking. Check the carrier booking and cancel it before retrying.');
  const note = result.message
    || (result.awb
      ? `Shipment created via ${result.carrier}. AWB ${result.awb}`
      : `Shipment queued via ${result.carrier}`);
  await lock.query(`INSERT INTO order_events (order_id, status, note) VALUES ($1,$2,$3)`, [
    orderId,
    result.awb ? 'shipped' : shipStatus,
    note,
  ]);

  await lock.query('COMMIT');
  const updated = await loadOrderBundle(orderId);
  await notifyOrderEvent({
    order: updated,
    event: result.awb ? 'Shipped' : 'Shipment update',
    note,
  });

  return { order: rows[0], result };
  }catch(e){await lock.query('ROLLBACK');throw e;}finally{lock.release();}
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
  const next = map[String(status || '').toLowerCase()];
  if(!next) return {orderId:rows[0].id,status:rows[0].status,ignored:true};
  const client=await (await getPool()).connect();
  try {
    await client.query('BEGIN');
    const locked=await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[rows[0].id]);
    const current=locked.rows[0];
    if(current.status===next){await client.query('COMMIT');return {orderId:current.id,status:next,duplicate:true};}
    try { await transitionOrder(client,current,next,{note:note || 'Carrier update: '+status}); }
    catch(e){ if(e.message.startsWith('Cannot change')) {await client.query('ROLLBACK');return {orderId:current.id,status:current.status,ignored:true};} throw e; }
    await client.query('UPDATE orders SET tracking_url=COALESCE($2,tracking_url) WHERE id=$1',[current.id,trackingUrl || null]);
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
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
