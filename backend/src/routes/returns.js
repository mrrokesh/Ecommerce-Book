import {Router} from 'express';
import {query,getPool} from '../db/pool.js';
import {requireAuth,requirePermission} from '../middleware/auth.js';
import {canReturn,money} from '../domain/orderPolicy.js';
import {queueRefund,audit} from '../domain/lifecycle.js';
import {returnUpdateEmail} from '../notify/accountMail.js';
const router=Router();
const wrap=fn=>async(req,res)=>{const c=await(await getPool()).connect();try{await c.query('BEGIN');const data=await fn(req,c);await c.query('COMMIT');(req.afterCommit||[]).forEach(f=>f());res.json({success:true,data});}catch(e){await c.query('ROLLBACK');res.status(400).json({success:false,error:e.message});}finally{c.release();}};
router.get('/admin',requirePermission('orders'),async(req,res)=>{const rows=(await query('SELECT r.*,o.order_number FROM return_cases r JOIN orders o ON o.id=r.order_id ORDER BY r.created_at DESC LIMIT 200')).rows;res.json({success:true,data:{rows}});});
router.post('/:orderId',requireAuth,wrap(async(req,c)=>{
  const o=(await c.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.orderId,req.user.id])).rows[0];
  if(!o||!canReturn(o,o.return_days))throw new Error('This order is not eligible for a return');
  const pending=await c.query("SELECT 1 FROM return_cases WHERE order_id=$1 AND status IN ('requested','approved')",[o.id]);if(pending.rowCount)throw new Error('A return is already awaiting review');
  const reason=String(req.body.reason||'').trim();if(!reason||reason.length>1000)throw new Error('Enter a return reason');
  const lines=req.body.items;if(!Array.isArray(lines)||!lines.length||lines.length>100||new Set(lines.map(i=>i.id)).size!==lines.length)throw new Error('Select distinct items to return');
  const items=(await c.query('SELECT * FROM order_items WHERE order_id=$1',[o.id])).rows;
  for(const line of lines){const item=items.find(i=>i.id===line.id);if(!item||!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>item.quantity-item.returned_quantity)throw new Error('Invalid return quantity');}
  const r=await c.query('INSERT INTO return_cases(order_id,items,reason) VALUES($1,$2,$3) RETURNING *',[o.id,JSON.stringify(lines),reason]);req.afterCommit=[()=>returnUpdateEmail(o.id,'requested')];return r.rows[0];
}));
router.post('/admin/:id',requirePermission('orders_edit'),wrap(async(req,c)=>{
  const r=(await c.query('SELECT * FROM return_cases WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!r)throw new Error('Return not found');
  const o=(await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[r.order_id])).rows[0];
  const action=req.body.action,note=String(req.body.note||'').trim();if(!note)throw new Error('Pickup reference or inspection note required');
  if(action==='approve'||action==='decline'){
    if(r.status!=='requested')throw new Error('This request has already been reviewed');
    await c.query('UPDATE return_cases SET status=$2,pickup_reference=$3 WHERE id=$1',[r.id,action==='approve'?'approved':'declined',note]);
  }else if(action==='receive'){
    if(req.user.role!=='admin'&&!req.permissions.includes('refunds'))throw new Error('Refund permission is required to receive paid returns');
    if(r.status!=='approved'||o.status!=='delivered')throw new Error('Approve pickup before receiving items; the order must remain delivered');
    const gifts=await c.query('SELECT 1 FROM gift_cards WHERE order_id=$1',[o.id]);if(gifts.rowCount)throw new Error('Gift-card orders require the full cancellation workflow');
    let amount=0;
    for(const line of r.items){
      const i=(await c.query('UPDATE order_items SET returned_quantity=returned_quantity+$2 WHERE id=$1 AND order_id=$3 AND returned_quantity+$2<=quantity RETURNING *',[line.id,line.quantity,o.id])).rows[0];
      if(!i)throw new Error('Return quantity exceeds the remaining quantity');
      amount+=Number(i.unit_price)*line.quantity;
      if(i.book_id){await c.query('UPDATE books SET stock=stock+$2 WHERE id=$1',[i.book_id,line.quantity]);await c.query('INSERT INTO stock_movements(book_id,delta,reason,actor_id,order_id) VALUES($1,$2,$3,$4,$5)',[i.book_id,line.quantity,'Inspected item return',req.user.id,o.id]);}
    }
    amount=money(amount*(1-Number(o.discount)/Math.max(1,Number(o.subtotal))));
    const paid=Number(o.total)+Number(o.gift_credit);
    const gift=paid>0?money(amount*Number(o.gift_credit)/paid):0;
    if(gift>0){await c.query("UPDATE gift_cards SET remaining=remaining+$2,status='active' WHERE code=$1 AND status<>'void'",[o.gift_card_code,gift]);await c.query('INSERT INTO gift_transactions(code,order_id,amount,reason) VALUES($1,$2,$3,$4)',[o.gift_card_code,o.id,gift,'Partial return']);}
    if(amount-gift>0)await queueRefund(c,o,money(amount-gift),'Item return: '+r.reason,req.user);
    await c.query("UPDATE return_cases SET status='received',inspection=$2 WHERE id=$1",[r.id,note]);
    const remain=await c.query('SELECT 1 FROM order_items WHERE order_id=$1 AND returned_quantity<quantity',[o.id]);
    if(!remain.rowCount)await c.query("UPDATE orders SET status='returned',stock_restored=TRUE,updated_at=NOW() WHERE id=$1",[o.id]);
  }else throw new Error('Unknown return action');
  await audit(c,req.user,'return.'+action,o.id,{returnId:r.id,note});req.afterCommit=[()=>returnUpdateEmail(o.id,action==='approve'?'approved':action==='decline'?'declined':'received',note)];return {saved:true};
}));
export default router;
