import { getPool, query } from '../db/pool.js';
import { assertTransition, money } from './orderPolicy.js';
import { refundUpdateEmail } from '../notify/accountMail.js';
import { refundRazorpayPayment, fetchRazorpayRefund } from '../routes/payments.js';

export async function audit(client, actor, action, entity, details = {}) {
  await client.query('INSERT INTO audit_log(actor_id,actor_name,action,entity_id,details) VALUES($1,$2,$3,$4,$5)',
    [actor?.id || null, actor?.name || 'System', action, String(entity), JSON.stringify(details)]);
}
export async function queueRefund(client, order, amount, reason, actor) {
  const previous = await client.query("SELECT COALESCE(SUM(amount),0) AS amount FROM refund_requests WHERE order_id=$1", [order.id]);
  if (!(amount > 0) || money(Number(previous.rows[0].amount) + amount) > Number(order.total)) throw new Error('Refund exceeds the remaining payment');
  if (!['paid','refund_pending','partially_refunded'].includes(order.payment_status)) throw new Error('Only collected payments can be refunded');
  const { rows } = await client.query('INSERT INTO refund_requests(order_id,amount,reason,actor_id) VALUES($1,$2,$3,$4) RETURNING *', [order.id, money(amount), reason, actor?.id || null]);
  await client.query("UPDATE orders SET payment_status='refund_pending' WHERE id=$1", [order.id]);
  await audit(client, actor, 'refund.requested', order.id, { amount, reason });
  return rows[0];
}
export async function transitionOrder(client, order, next, { actor, note = '', paymentStatus } = {}) {
  assertTransition(order.status, next);
  if(['return_requested','returned'].includes(next)){
    const pending=await client.query("SELECT 1 FROM return_cases WHERE order_id=$1 AND status IN ('requested','approved')",[order.id]);
    if(pending.rowCount)throw new Error('Complete or decline the open item return before changing the whole order');
  }
  if (paymentStatus && paymentStatus !== order.payment_status) {
    if (!(order.payment_method === 'cod' && order.payment_status === 'pending' && paymentStatus === 'paid' && next === 'delivered')) {
      throw new Error('Use the refund workflow; online payment status is controlled by the gateway');
    }
  }
  if (['cancelled','returned'].includes(next) && !order.stock_restored) {
    const gifts = await client.query('SELECT * FROM gift_cards WHERE order_id=$1 FOR UPDATE', [order.id]);
    if (gifts.rows.some(g => Number(g.remaining) < Number(g.amount))) throw new Error('An issued gift card has been spent. Resolve its balance before refunding this order.');
    await client.query("UPDATE gift_cards SET status='void',remaining=0 WHERE order_id=$1", [order.id]);
    const items = await client.query('SELECT book_id,quantity-returned_quantity AS quantity FROM order_items WHERE order_id=$1 AND book_id IS NOT NULL ORDER BY book_id', [order.id]);
    for (const item of items.rows) {
      await client.query('UPDATE books SET stock=stock+$1 WHERE id=$2',[item.quantity,item.book_id]);
      await client.query('INSERT INTO stock_movements(book_id,delta,reason,actor_id,order_id) VALUES($1,$2,$3,$4,$5)',[item.book_id,item.quantity,next,actor?.id || null,order.id]);
    }
    if (Number(order.gift_credit) > 0 && !order.gift_credit_restored) {
      const restored=await client.query('SELECT COALESCE(SUM(amount),0) AS amount FROM gift_transactions WHERE order_id=$1 AND amount>0',[order.id]);
      const credit=Math.max(0,Number(order.gift_credit)-Number(restored.rows[0].amount));
      await client.query("UPDATE gift_cards SET remaining=remaining+$1,status='active' WHERE code=$2 AND status <> 'void'", [credit,order.gift_card_code]);
      await client.query('INSERT INTO gift_transactions(code,order_id,amount,reason) VALUES($1,$2,$3,$4)',[order.gift_card_code,order.id,credit,next]);
    }
    await client.query('UPDATE orders SET stock_restored=TRUE,gift_credit_restored=TRUE WHERE id=$1',[order.id]);
    const existing = await client.query('SELECT COALESCE(SUM(amount),0) AS amount FROM refund_requests WHERE order_id=$1',[order.id]);
    const due = money(Number(order.total)-Number(existing.rows[0].amount));
    if (due > 0 && ['paid','partially_refunded','refund_pending'].includes(order.payment_status)) await queueRefund(client,order,due,note || next,actor);
    else if (order.payment_status === 'pending') await client.query("UPDATE orders SET payment_status='cancelled' WHERE id=$1",[order.id]);
  }
  await client.query(`UPDATE orders SET status=$2::varchar, delivered_at=CASE WHEN $2::varchar='delivered' THEN COALESCE(delivered_at,NOW()) ELSE delivered_at END,
    payment_status=CASE WHEN $2::varchar='delivered' AND payment_method='cod' AND payment_status='pending' THEN 'paid' ELSE payment_status END,
    updated_at=NOW() WHERE id=$1`,[order.id,next]);
  if (order.status !== next) {
    await client.query('INSERT INTO order_events(order_id,status,note) VALUES($1,$2,$3)',[order.id,next,note || `Status changed to ${next}`]);
    await audit(client,actor,'order.status',order.id,{from:order.status,to:next,note});
  }
}
export async function processRefund(id, { manual = false, actor, refundPayment = refundRazorpayPayment, lookupRefund = fetchRazorpayRefund } = {}) {
  const client = await (await getPool()).connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT r.*,COALESCE(o.razorpay_payment_id,a.payment_id) AS razorpay_payment_id,COALESCE(o.total,(a.quote->>'total')::numeric) AS total FROM refund_requests r LEFT JOIN orders o ON o.id=r.order_id LEFT JOIN checkout_attempts a ON a.id=r.attempt_id WHERE r.id=$1 FOR UPDATE OF r`,[id]);
    const refund = rows[0];
    if (!refund) throw new Error('Refund not found');
    if(refund.order_id)await client.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[refund.order_id]);
    if (refund.status === 'completed') { await client.query('COMMIT'); return refund; }
    let gateway;
    if (refund.razorpay_payment_id) {
      gateway = refund.gateway_id ? await lookupRefund(refund.gateway_id) : await refundPayment(refund.razorpay_payment_id,refund.amount,refund.id);
      if (gateway.skipped) throw new Error('Configure Razorpay before retrying this refund');
    } else {
      if (!manual) { await client.query('COMMIT'); return refund; }
      gateway = { status:'processed', refundId:null };
    }
    const status = gateway.status === 'processed' ? 'completed' : gateway.status === 'failed' ? 'failed' : 'processing';
    await client.query('UPDATE refund_requests SET status=$2,gateway_id=$3,error=NULL,updated_at=NOW() WHERE id=$1',[id,status,gateway.refundId]);
    const totals = await client.query("SELECT COALESCE(SUM(amount) FILTER(WHERE status='completed'),0) AS refunded, COUNT(*) FILTER(WHERE status<>'completed') AS pending FROM refund_requests WHERE order_id=$1",[refund.order_id]);
    const t=totals.rows[0];
    const pay=Number(t.refunded)>=Number(refund.total)?'refunded':Number(t.pending)>0?'refund_pending':Number(t.refunded)>0?'partially_refunded':'paid';
    await client.query('UPDATE orders SET payment_status=$2 WHERE id=$1',[refund.order_id,pay]);
    if(refund.attempt_id && status==='completed')await client.query("UPDATE checkout_attempts SET status='refunded',error=NULL WHERE id=$1",[refund.attempt_id]);
    await audit(client,actor,'refund.'+status,refund.order_id,{refundId:id,amount:refund.amount,manual});
    await client.query('COMMIT');
    refundUpdateEmail(refund.order_id, refund.amount, status);
    return { ...refund,status };
  } catch(err) {
    await client.query('ROLLBACK');
    await query("UPDATE refund_requests SET status='failed',error=$2,updated_at=NOW() WHERE id=$1 AND status<>'completed'",[id,err.message]);
    throw err;
  } finally { client.release(); }
}
