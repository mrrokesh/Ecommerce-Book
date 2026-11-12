import { renderEmail, siteBase } from '../notify/emailTemplate.js';
import crypto from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query,getPool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { sendMail,mailConfigured,mailBudgetOk } from '../mailer.js';
import { transitionOrder } from '../domain/lifecycle.js';
import { canReturn } from '../domain/orderPolicy.js';
import { renderInvoiceHtml } from '../invoice/pdf.js';
const router=Router();
const limit=rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:true,legacyHeaders:false});
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
router.post('/guest-link',limit,async(req,res)=>{
  if(!mailConfigured())return res.status(503).json({success:false,error:'Email delivery is unavailable. Please contact the store for order assistance.'});
  const o=(await query('SELECT id FROM orders WHERE order_number=$1 AND lower(guest_email)=lower($2) AND user_id IS NULL',[String(req.body.orderNumber||''),String(req.body.email||'')])).rows[0];
  if(o&&await mailBudgetOk(req.body.email,'Your secure order access link')){const token=crypto.randomBytes(32).toString('hex');await query("UPDATE orders SET guest_token_hash=$2, guest_token_expires_at=NOW()+INTERVAL '24 hours' WHERE id=$1",[o.id,hash(token)]);
    const base=String(process.env.CLIENT_URL||'http://localhost:5173').split(',')[0];
    {const {html,text}=renderEmail({badge:'Secure link',title:'View your order',preheader:'Your private link to see this order.',greeting:'Hi,',paragraphs:['Use the button below to view your order, track it and request a cancellation or return. This link is private to you, so please do not share it.'],cta:{label:'View my order',url:`${base}/guest-order#${token}`}});await sendMail({to:req.body.email,subject:'Your secure order access link',text,html});}}
  res.json({success:true,data:{message:'If those details match a guest order, an access link has been emailed.'}});
});
async function guest(req,res,next){
  const token=String(req.get('x-order-token')||'');
  if(!/^[a-f0-9]{64}$/.test(token))return res.status(401).json({success:false,error:'Open the secure link from your order email'});
  const tokenHash=hash(token);
  const o=(await query('SELECT * FROM orders WHERE guest_token_hash=$1 AND user_id IS NULL AND guest_token_expires_at>NOW()',[tokenHash])).rows[0];
  if(!o)return res.status(404).json({success:false,error:'Order link is invalid or expired. Request a new link.'});req.guestOrder=o;req.guestTokenHash=tokenHash;res.set('Cache-Control','no-store');next();
}
router.get('/guest-order',limit,guest,async(req,res)=>{
  const o=req.guestOrder;
  const items=(await query('SELECT title,quantity,unit_price,line_total FROM order_items WHERE order_id=$1',[o.id])).rows;
  const events=(await query('SELECT status,note,created_at FROM order_events WHERE order_id=$1 ORDER BY created_at',[o.id])).rows;
  res.json({success:true,data:{order:{orderNumber:o.order_number,status:o.status,total:o.total,paymentStatus:o.payment_status,shippingAddress:o.shipping_address,awb:o.awb,canCancel:['placed','confirmed','packed'].includes(o.status),canReturn:canReturn(o,o.return_days)},items,events}});
});
router.get('/guest-order/invoice',limit,guest,async(req,res)=>{const items=await query('SELECT * FROM order_items WHERE order_id=$1',[req.guestOrder.id]);res.type('html').send(renderInvoiceHtml(req.guestOrder,items.rows));});
router.post('/guest-order/:action',limit,guest,async(req,res)=>{
  const c=await(await getPool()).connect();try{
    await c.query('BEGIN');const o=(await c.query('SELECT * FROM orders WHERE id=$1 AND guest_token_hash=$2 AND user_id IS NULL AND guest_token_expires_at>clock_timestamp() FOR UPDATE',[req.guestOrder.id,req.guestTokenHash])).rows[0];
    if(!o)throw new Error('Order link is invalid or expired. Request a new link.');
    const next=req.params.action==='cancel'?'cancelled':req.params.action==='return'?'return_requested':null;
    if(!next)throw new Error('Unknown action');
    if(next==='return_requested'&&!canReturn(o,o.return_days))throw new Error('The return window has closed');
    const reason=String(req.body.reason||'').trim().slice(0,1000);if(!reason)throw new Error('Please provide a reason');
    await transitionOrder(c,o,next,{note:'Guest customer: '+reason});await c.query('COMMIT');res.json({success:true,data:{saved:true}});
  }catch(e){await c.query('ROLLBACK');res.status(400).json({success:false,error:e.message});}finally{c.release();}
});
router.post('/stock-alerts/:id',requireAuth,async(req,res)=>{
  await query('INSERT INTO stock_alerts(book_id,user_id) VALUES($1,$2) ON CONFLICT(book_id,user_id) DO UPDATE SET notified_at=NULL',[req.params.id,req.user.id]);
  res.json({success:true,data:{saved:true}});
});
router.post('/reorder/:id',requireAuth,async(req,res)=>{
  const c=await(await getPool()).connect();try{
    await c.query('BEGIN');const o=await c.query('SELECT id FROM orders WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);if(!o.rowCount)throw new Error('Order not found');
    let cart=(await c.query('SELECT id FROM carts WHERE user_id=$1 FOR UPDATE',[req.user.id])).rows[0];
    if(!cart)cart=(await c.query('INSERT INTO carts(user_id) VALUES($1) RETURNING id',[req.user.id])).rows[0];
    const items=(await c.query('SELECT i.book_id,i.quantity,b.stock,b.is_active FROM order_items i JOIN books b ON b.id=i.book_id WHERE i.order_id=$1',[req.params.id])).rows;
    let added=0;
    for(const i of items)if(i.is_active&&i.stock>0){await c.query('INSERT INTO cart_items(cart_id,book_id,quantity) VALUES($1,$2,$3) ON CONFLICT(cart_id,book_id) DO UPDATE SET quantity=LEAST($4,cart_items.quantity+EXCLUDED.quantity)',[cart.id,i.book_id,Math.min(i.quantity,i.stock),i.stock]);added++;}
    await c.query('COMMIT');res.json({success:true,data:{added,skipped:items.length-added}});
  }catch(e){await c.query('ROLLBACK');res.status(400).json({success:false,error:e.message});}finally{c.release();}
});
export async function notifyStockAlerts(){
  const {rows}=await query('SELECT a.id,u.email,b.title,b.slug FROM stock_alerts a JOIN books b ON b.id=a.book_id JOIN users u ON u.id=a.user_id WHERE a.notified_at IS NULL AND b.stock>0 AND b.is_active=TRUE LIMIT 50');
  for(const a of rows){{const {html,text}=renderEmail({badge:'Back in stock',title:`${a.title} is back in stock`,preheader:'The book you wanted is available again.',paragraphs:['Good news! A book you asked us to watch is available again. Copies can sell out quickly, so grab yours soon.'],cta:{label:'Buy now',url:`${siteBase()}/books/${a.slug}`}});await sendMail({to:a.email,subject:a.title+' is back in stock',text,html});}await query('UPDATE stock_alerts SET notified_at=NOW() WHERE id=$1',[a.id]);}
}
export default router;
