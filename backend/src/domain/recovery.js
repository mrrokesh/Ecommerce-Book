import crypto from 'crypto';
import Razorpay from 'razorpay';
import { query } from '../db/pool.js';
import { placeOrder } from '../routes/orders.js';
import { processRefund } from './lifecycle.js';
export async function recoverPayment(id) {
  const {rows}=await query('SELECT * FROM checkout_attempts WHERE id=$1',[id]);
  const a=rows[0]; if(!a || a.order_id || ['refunded','refund_pending'].includes(a.status) || !a.gateway_order_id) return a;
  const gateway=new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET});
  const payments=await gateway.orders.fetchPayments(a.gateway_order_id);
  const payment=payments.items?.find(p=>p.status==='captured');
  if(!payment) return a;
  await query("UPDATE checkout_attempts SET payment_id=$2,status='paid' WHERE id=$1",[id,payment.id]);
  const user=a.user_id?(await query('SELECT id,email,name FROM users WHERE id=$1',[a.user_id])).rows[0]:null;
  let result;let code=200;
  const response={status(n){code=n;return this;},json(value){result=value;return value;}};
  const signature=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET).update(`${a.gateway_order_id}|${payment.id}`).digest('hex');
  await placeOrder({user,body:{...a.payload,paymentMethod:'razorpay',razorpayOrderId:a.gateway_order_id,razorpayPaymentId:payment.id,razorpaySignature:signature}},response);
  if(code>=400 || !result?.success){
    await query("UPDATE checkout_attempts SET status='needs_review',error=$2 WHERE id=$1 AND order_id IS NULL",[id,result?.error || 'Order recovery failed']);
  }
  return (await query('SELECT * FROM checkout_attempts WHERE id=$1',[id])).rows[0];
}
let running=false;
export async function recoverOperations(){
  if(running)return;running=true;
  try{
    if(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET){
      const attempts=await query("SELECT id FROM checkout_attempts WHERE order_id IS NULL AND status NOT IN ('refunded','refund_pending') AND gateway_order_id IS NOT NULL AND created_at>NOW()-INTERVAL '7 days' ORDER BY created_at LIMIT 30");
      for(const a of attempts.rows) await recoverPayment(a.id).catch(e=>console.warn('Payment recovery:',e.message));
      const refunds=await query("SELECT r.id FROM refund_requests r LEFT JOIN orders o ON o.id=r.order_id LEFT JOIN checkout_attempts a ON a.id=r.attempt_id WHERE r.status IN ('pending','processing') AND COALESCE(o.razorpay_payment_id,a.payment_id) IS NOT NULL ORDER BY r.created_at LIMIT 30");
      for(const r of refunds.rows) await processRefund(r.id).catch(e=>console.warn('Refund recovery:',e.message));
    }
  }finally{running=false;}
}
