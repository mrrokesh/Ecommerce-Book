import {fulfilmentDocument} from '../domain/fulfilmentDocuments.js';
import crypto from 'crypto';
import { Router } from 'express';
import { query,getPool } from '../db/pool.js';
import { requireBackOffice } from '../middleware/auth.js';
import { audit,queueRefund,processRefund,transitionOrder } from '../domain/lifecycle.js';
import { recoverPayment } from '../domain/recovery.js';
import { storeSettings } from '../domain/settings.js';
import { csv,parseCsv } from '../domain/csv.js';
import { deliverEmail } from '../mailer.js';
const router=Router();
router.use(requireBackOffice);
const sections={payments:'refunds',returns:'orders',inventory:'products',products:'products',customers:'customers',reports:'dashboard',gifts:'marketing',emails:'emails',orders:'orders'};
router.use((req,res,next)=>{
  const module=sections[req.path.split('/')[1]];
  if(req.user.role==='admin'||(module&&req.permissions.includes(module)))return next();
  return res.status(403).json({success:false,error:'You do not have permission for this action'});
});
router.use((req,res,next)=>{
  if(req.user.role!=='admin'&&!['GET','HEAD'].includes(req.method)){
    const module=/^\/(inventory|products)/.test(req.path)?'products_edit':/^\/(orders|returns)/.test(req.path)?'orders_edit':null;
    if(module&&!req.permissions.includes(module))return res.status(403).json({success:false,error:'Read-only access'});
  }next();
});
const wrap=fn=>async(req,res)=>{try{const data=await fn(req,res);if(!res.headersSent)res.json({success:true,data});}catch(e){res.status(400).json({success:false,error:e.message});}};
async function transaction(fn){const c=await(await getPool()).connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
const pageOf=req=>Math.max(1,parseInt(req.query.page)||1);
router.get('/settings',wrap(()=>storeSettings()));
router.put('/settings',wrap(async req=>{
  const s=req.body;
  for(const k of ['shippingFee','freeShippingThreshold','returnDays','lowStockThreshold'])if(!Number.isFinite(Number(s[k]))||Number(s[k])<0||Number(s[k])>100000)throw new Error('Invalid '+k);
  if(!Number.isInteger(Number(s.returnDays))||!Number.isInteger(Number(s.lowStockThreshold)))throw new Error('Days and stock threshold must be whole numbers');
  const value=Object.fromEntries(['shippingFee','freeShippingThreshold','returnDays','lowStockThreshold'].map(k=>[k,Number(s[k])]));value.restrictedCoverage=!!s.restrictedCoverage;
  await transaction(async c=>{await c.query("INSERT INTO site_settings(key,value) VALUES('commerce',$1) ON CONFLICT(key) DO UPDATE SET value=$1,updated_at=NOW()",[JSON.stringify(value)]);await audit(c,req.user,'settings.updated','commerce',value);});return value;
}));
router.get('/settings/pincodes',wrap(async()=>({rows:(await query('SELECT * FROM pincodes ORDER BY pincode')).rows})));
router.put('/settings/pincodes',wrap(async req=>{
  const {pincode,city,state,shipping,etaDays}=req.body;
  if(!/^[1-9]\d{5}$/.test(pincode)||!city||!state||!Number.isFinite(Number(shipping))||Number(shipping)<0||!Number.isInteger(Number(etaDays))||Number(etaDays)<1)throw new Error('Enter a valid pincode, city, state, charge and ETA');
  await query('INSERT INTO pincodes(pincode,city,state,shipping,eta_days) VALUES($1,$2,$3,$4,$5) ON CONFLICT(pincode) DO UPDATE SET city=$2,state=$3,shipping=$4,eta_days=$5',[pincode,city,state,shipping,etaDays]);return {saved:true};
}));
router.delete('/settings/pincodes/:pin',wrap(async req=>{await query('DELETE FROM pincodes WHERE pincode=$1',[req.params.pin]);return {deleted:true};}));
router.get('/audit',wrap(async req=>({rows:(await query('SELECT * FROM audit_log ORDER BY id DESC LIMIT 50 OFFSET $1',[(pageOf(req)-1)*50])).rows,page:pageOf(req)})));
router.get('/inventory',wrap(async req=>{
  const settings=await storeSettings();
  return {rows:(await query('SELECT id,title,sku,stock,sale_price FROM books WHERE is_active=TRUE AND ($1=FALSE OR stock<=$2) AND title ILIKE $3 ORDER BY stock,id LIMIT 50 OFFSET $4',[req.query.low==='true',settings.lowStockThreshold,'%'+(req.query.q||'')+'%',(pageOf(req)-1)*50])).rows,page:pageOf(req)};
}));
router.get('/inventory/history',wrap(async req=>({rows:(await query('SELECT s.*,b.title,u.name AS actor FROM stock_movements s LEFT JOIN books b ON b.id=s.book_id LEFT JOIN users u ON u.id=s.actor_id ORDER BY s.id DESC LIMIT 100 OFFSET $1',[(pageOf(req)-1)*100])).rows})));
router.post('/inventory/adjust',wrap(async req=>transaction(async c=>{
  const {bookId,delta,reason}=req.body;
  if(!Number.isInteger(Number(delta))||!Number(delta)||!String(reason||'').trim())throw new Error('A nonzero whole quantity and reason are required');
  const {rows}=await c.query('UPDATE books SET stock=stock+$2 WHERE id=$1 AND stock+$2>=0 RETURNING id,stock',[bookId,Number(delta)]);
  if(!rows[0])throw new Error('Product not found or adjustment would make stock negative');
  await c.query('INSERT INTO stock_movements(book_id,delta,reason,actor_id) VALUES($1,$2,$3,$4)',[bookId,delta,String(reason).slice(0,1000),req.user.id]);
  await audit(c,req.user,'stock.adjusted',bookId,{delta,reason});return rows[0];
})));
router.get('/payments',wrap(async()=>({
  refunds:(await query('SELECT r.*,o.order_number,COALESCE(o.razorpay_payment_id,a.payment_id) AS razorpay_payment_id FROM refund_requests r LEFT JOIN orders o ON o.id=r.order_id LEFT JOIN checkout_attempts a ON a.id=r.attempt_id ORDER BY r.created_at DESC LIMIT 200')).rows,
  attempts:(await query('SELECT id,gateway_order_id,payment_id,order_id,status,error,created_at,quote->>\'total\' AS amount FROM checkout_attempts ORDER BY created_at DESC LIMIT 200')).rows,
})));
router.post('/payments/refund',wrap(async req=>transaction(async c=>{
  const o=(await c.query('SELECT * FROM orders WHERE order_number=$1 OR id::text=$1 FOR UPDATE',[String(req.body.order||'')])).rows[0];
  if(!o)throw new Error('Order not found');
  if(!String(req.body.reason||'').trim())throw new Error('Refund reason is required');
  const gifts=await c.query('SELECT 1 FROM gift_cards WHERE order_id=$1',[o.id]);
  if(gifts.rowCount)throw new Error('Cancel an unspent gift-card order to refund it');
  return queueRefund(c,o,Number(req.body.amount),req.body.reason,req.user);
})));
router.post('/payments/refunds/:id/retry',wrap(req=>processRefund(req.params.id,{manual:!!req.body.manual,actor:req.user})));
router.post('/payments/attempts/:id/refund',wrap(req=>transaction(async c=>{
 const a=(await c.query('SELECT * FROM checkout_attempts WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
 if(!a || a.order_id || !a.payment_id || a.status==='refunded')throw new Error('This payment cannot be refunded from recovery');
 const r=await c.query('INSERT INTO refund_requests(attempt_id,amount,reason,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT(attempt_id) WHERE attempt_id IS NOT NULL DO NOTHING RETURNING id',[a.id,a.quote.total,'Unfulfilled paid checkout',req.user.id]);
 await c.query("UPDATE checkout_attempts SET status='refund_pending' WHERE id=$1",[a.id]);
 await audit(c,req.user,'payment.refund_requested',a.id);return {queued:true};
})));
router.post('/payments/attempts/:id/recover',wrap(req=>recoverPayment(req.params.id)));
router.get('/returns',wrap(async()=>({rows:(await query("SELECT id,order_number,status,shipping_name,total,payment_status,delivered_at FROM orders WHERE status IN ('return_requested','return_approved','returned') ORDER BY updated_at DESC LIMIT 200")).rows})));
router.post('/returns/:id',wrap(req=>transaction(async c=>{
  const o=(await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!o)throw new Error('Order not found');
  if(!['return_approved','returned','delivered'].includes(req.body.status))throw new Error('Invalid return decision');
  if(!String(req.body.note||'').trim())throw new Error('Inspection or decision note required');
  if(req.user.role!=='admin'&&req.body.status==='returned'&&!req.permissions.includes('refunds'))throw new Error('Refund permission is required');
  await transitionOrder(c,o,req.body.status,{actor:req.user,note:req.body.note});return {saved:true};
})));
const maskCode=(c)=>String(c||'').length>4?'****'+String(c).slice(-4):'****';
router.get('/gifts',wrap(async req=>({rows:(await query('SELECT * FROM gift_cards WHERE code ILIKE $1 ORDER BY id DESC LIMIT 100',['%'+(req.query.q||'')+'%'])).rows.map(g=>req.user.role==='admin'?g:{...g,code:maskCode(g.code)}),transactions:(await query('SELECT * FROM gift_transactions ORDER BY id DESC LIMIT 100')).rows.map(x=>req.user.role==='admin'?x:{...x,code:maskCode(x.code)})})));
router.get('/customers',wrap(async req=>({rows:(await query(`SELECT u.id,u.name,u.email,u.phone,COUNT(o.id)::int AS orders FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.name ILIKE $1 OR u.email ILIKE $1 GROUP BY u.id ORDER BY u.created_at DESC LIMIT 50 OFFSET $2`,['%'+(req.query.q||'')+'%',(pageOf(req)-1)*50])).rows,page:pageOf(req)})));
router.get('/customers/:id',wrap(async req=>({customer:(await query('SELECT id,name,email,phone FROM users WHERE id=$1',[req.params.id])).rows[0],orders:(await query('SELECT id,order_number,status,total,payment_status,created_at FROM orders WHERE user_id=$1 ORDER BY created_at DESC',[req.params.id])).rows,notes:(await query('SELECT n.*,u.name AS actor FROM customer_notes n LEFT JOIN users u ON u.id=n.actor_id WHERE n.user_id=$1 ORDER BY n.id DESC',[req.params.id])).rows})));
router.post('/customers/:id/notes',wrap(async req=>{
  const note=String(req.body.note||'').trim();if(!note||note.length>2000)throw new Error('Enter a note up to 2000 characters');
  await query('INSERT INTO customer_notes(user_id,actor_id,note) VALUES($1,$2,$3)',[req.params.id,req.user.id,note]);return {saved:true};
}));
router.get('/emails',wrap(async req=>({rows:(await query('SELECT id,to_email,subject,sent,error,attempts,created_at FROM email_outbox ORDER BY created_at DESC LIMIT 50 OFFSET $1',[(pageOf(req)-1)*50])).rows})));
router.post('/emails/:id/retry',wrap(async req=>{await query('UPDATE email_outbox SET attempts=0,next_attempt_at=NOW() WHERE id=$1 AND sent=FALSE',[req.params.id]);return deliverEmail(req.params.id);}));
router.get('/products',wrap(async()=>({rows:[]})));
router.get('/products/export',wrap(async(req,res)=>{const rows=(await query('SELECT id,title,author_name,sku,mrp,sale_price,stock,is_active FROM books ORDER BY id')).rows;res.type('text/csv').attachment('products.csv').send(csv(rows));}));
router.post('/products/import',wrap(req=>transaction(async c=>{
  const rows=parseCsv(String(req.body.csv||''));if(!rows.length||rows.length>1000)throw new Error('Import between 1 and 1000 rows');
  for(const [i,r] of rows.entries()){
    const stock=Number(r.stock),mrp=Number(r.mrp),price=Number(r.sale_price);
    if(!r.title?.trim()||!r.author_name?.trim()||!Number.isInteger(stock)||stock<0||!Number.isFinite(mrp)||!Number.isFinite(price)||price<0||mrp<price||!['true','false'].includes(r.is_active))throw new Error('Invalid product on row '+(i+2));
    let id=r.id;
    if(id){const old=(await c.query('SELECT stock FROM books WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old)throw new Error('Unknown product '+id);
      await c.query('UPDATE books SET title=$2,author_name=$3,sku=$4,mrp=$5,sale_price=$6,stock=$7,is_active=$8 WHERE id=$1',[id,r.title,r.author_name,r.sku||null,mrp,price,stock,r.is_active==='true']);
      await c.query('INSERT INTO stock_movements(book_id,delta,reason,actor_id) VALUES($1,$2,$3,$4)',[id,stock-old.stock,'CSV import',req.user.id]);
    }else {id=(await c.query("INSERT INTO books(title,slug,author_name,sku,mrp,sale_price,stock,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",[r.title,'import-'+crypto.randomUUID(),r.author_name,r.sku||null,mrp,price,stock,r.is_active==='true'])).rows[0].id;}
    await audit(c,req.user,'product.imported',id,{stock,price});
  }return {imported:rows.length};
})));
router.post('/products/bulk',wrap(req=>transaction(async c=>{
  const ids=req.body.ids;if(!Array.isArray(ids)||!ids.length||ids.length>200||ids.some(id=>!Number.isInteger(Number(id))))throw new Error('Select 1–200 product IDs');
  const action=req.body.action,value=req.body.value;
  if(!['publish','hide','price','category'].includes(action))throw new Error('Unknown bulk action');
  for(const id of [...new Set(ids)].sort((a,b)=>a-b)){
    if(action==='price'){if(!Number.isFinite(Number(value))||Number(value)<0)throw new Error('Invalid price');const r=await c.query('UPDATE books SET sale_price=$2 WHERE id=$1 AND mrp>=$2 RETURNING id',[id,value]);if(!r.rowCount)throw new Error('Price exceeds MRP or product is missing: '+id);}
    else if(action==='category')await c.query('INSERT INTO book_categories(book_id,category_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,value]);
    else await c.query('UPDATE books SET is_active=$2 WHERE id=$1',[id,action==='publish']);
    await audit(c,req.user,'product.bulk.'+action,id,{value});
  }return {updated:ids.length};
})));
router.get('/orders/:id/document',wrap(async(req,res)=>{
 const o=(await query('SELECT * FROM orders WHERE id=$1',[req.params.id])).rows[0];if(!o)throw new Error('Order not found');
 const items=(await query('SELECT title,quantity FROM order_items WHERE order_id=$1',[o.id])).rows;
 res.type('html').send(fulfilmentDocument(o,items,req.query.kind));
}));
router.get('/orders/export',wrap(async(req,res)=>{const rows=(await query('SELECT order_number,status,payment_method,payment_status,total,shipping_name,shipping_phone,shipping_address,courier,awb,created_at FROM orders WHERE created_at >= $1::date AND created_at < $2::date + INTERVAL \'1 day\' ORDER BY created_at DESC',[req.query.from||'2000-01-01',req.query.to||'2100-01-01'])).rows;res.type('text/csv').attachment('orders.csv').send(csv(rows));}));
router.post('/orders/bulk',wrap(req=>transaction(async c=>{
  const ids=req.body.ids;if(!Array.isArray(ids)||!ids.length||ids.length>100)throw new Error('Select 1–100 orders');
  if(!['confirmed','packed'].includes(req.body.status))throw new Error('Bulk action must confirm or pack orders');
  for(const id of [...new Set(ids)].sort()){const o=(await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!o)throw new Error('Order not found');await transitionOrder(c,o,req.body.status,{actor:req.user,note:'Bulk fulfilment'});}return {updated:ids.length};
})));
router.get('/reports',wrap(async req=>{
  const params=[req.query.from||'2000-01-01',req.query.to||'2100-01-01'];
  const where="created_at >= $1::date AND created_at < $2::date+INTERVAL '1 day'";
  const stats=(await query(`SELECT COUNT(*)::int AS orders,COALESCE(SUM(total) FILTER(WHERE payment_status IN ('paid','partially_refunded','refund_pending','refunded')),0) AS collected,COALESCE(SUM(total) FILTER(WHERE payment_method='cod' AND payment_status='pending'),0) AS outstanding_cod FROM orders WHERE ${where}`,params)).rows[0];
  stats.refunded=(await query(`SELECT COALESCE(SUM(amount),0) AS amount FROM refund_requests WHERE status='completed' AND ${where}`,params)).rows[0].amount;
  return {stats,trend:(await query(`SELECT created_at::date AS day,COUNT(*)::int AS orders,SUM(total) AS order_value FROM orders WHERE ${where} GROUP BY day ORDER BY day`,params)).rows,bestsellers:(await query(`SELECT i.title,SUM(i.quantity)::int AS units,SUM(i.line_total) AS sales FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.created_at >= $1::date AND o.created_at < $2::date+INTERVAL '1 day' AND o.status NOT IN ('cancelled','returned') GROUP BY i.title ORDER BY units DESC LIMIT 20`,params)).rows};
}));
export default router;
