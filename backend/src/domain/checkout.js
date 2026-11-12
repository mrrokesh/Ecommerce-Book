import { query } from '../db/pool.js';
import { findActiveCoupon, couponDiscount, couponLimitError } from '../routes/coupons.js';
import { deliveryQuote } from './settings.js';
import { money } from './orderPolicy.js';
export async function quoteCheckout(body, user) {
  const cart = await query(user ? 'SELECT id FROM carts WHERE user_id=$1' : 'SELECT id FROM carts WHERE session_id=$1 AND user_id IS NULL',[user?.id || body.sessionId]);
  if (!cart.rows[0]) throw new Error('Your cart is empty');
  const {rows:items}=await query('SELECT b.id,b.title,b.sale_price,b.stock,b.cod_allowed,ci.quantity FROM cart_items ci JOIN books b ON b.id=ci.book_id WHERE ci.cart_id=$1 AND b.is_active=TRUE ORDER BY b.id',[cart.rows[0].id]);
  if (!items.length) throw new Error('Your cart is empty');
  if (items.some(i=>i.stock<i.quantity)) throw new Error('An item is out of stock. Update your cart.');
  let pin=body.shipping?.pincode;
  if(body.addressId){
    if(!user) throw new Error('Sign in to use a saved address');
    const a=await query('SELECT pincode FROM addresses WHERE id=$1 AND user_id=$2',[body.addressId,user.id]);
    if(!a.rows[0]) throw new Error('Address not found'); pin=a.rows[0].pincode;
  }
  const subtotal=money(items.reduce((s,i)=>s+Number(i.sale_price)*i.quantity,0));
  const coupon=body.couponCode?await findActiveCoupon(body.couponCode):null;
  if(body.couponCode && !coupon) throw new Error('Invalid or expired coupon');
  const error=await couponLimitError(coupon,{userId:user?.id,email:user?.email || body.guestEmail});
  if(error) throw new Error(error);
  const discount=couponDiscount(coupon,subtotal);
  if(coupon && !discount) throw new Error('The coupon minimum order amount has not been met');
  const delivery=await deliveryQuote(pin,subtotal-discount);
  let giftCredit=0;
  if(body.giftCardCode){
    const g=await query("SELECT remaining FROM gift_cards WHERE upper(code)=upper($1) AND status='active'",[body.giftCardCode]);
    if(!g.rows[0]) throw new Error('Gift card is invalid');
    giftCredit=Math.min(subtotal-discount+delivery.shipping,Number(g.rows[0].remaining));
  }
  return {subtotal,discount,shipping:delivery.shipping,giftCredit,total:money(Math.max(0,subtotal-discount+delivery.shipping-giftCredit)),codAvailable:!items.some(i=>i.cod_allowed===false),codBlockedItems:items.filter(i=>i.cod_allowed===false).map(i=>i.title),items:items.map(i=>({id:i.id,quantity:i.quantity,price:Number(i.sale_price)}))};
}
