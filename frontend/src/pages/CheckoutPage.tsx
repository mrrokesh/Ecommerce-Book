import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getSessionId } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../utils/format';
import { EmptyState, LoadingState } from '../components/States';

function loadRazorpay() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Razorpay'));
    document.body.appendChild(s);
  });
}

export default function CheckoutPage() {
  const { user, isAuthenticated } = useAuth();
  const { items, subtotal, loading, refresh, clear } = useCart();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState('');
  const [payMode, setPayMode] = useState('simulated');
  const [rzpKey, setRzpKey] = useState('');
  const [form, setForm] = useState({
    fullName: user?.name || '',
    phone: user?.phone || '',
    email: user?.email || '',
    line1: '',
    line2: '',
    city: 'Salem',
    state: 'Tamil Nadu',
    pincode: '',
    paymentMethod: 'cod',
    upiId: '',
    cardNumber: '',
    cardName: '',
    cardExpiry: '',
    cardCvv: '',
    couponCode: '',
    giftCardCode: '',
  });
  const [couponOff, setCouponOff] = useState(0);
  const [giftOff, setGiftOff] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pinHint, setPinHint] = useState('');

  useEffect(() => {
    api.get('/payments/config').then(({ data }) => {
      setPayMode(data.mode || 'simulated');
      setRzpKey(data.keyId || '');
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    api.get('/addresses').then(({ data }) => {
      const list = data.addresses || [];
      setAddresses(list);
      const def = list.find((a) => a.isDefault) || list[0];
      if (def) setAddressId(def.id);
    });
  }, [isAuthenticated]);

  function onChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function onPinBlur() {
    const pin = form.pincode.replace(/\D/g, '');
    if (pin.length !== 6) return;
    try {
      const { data } = await api.get(`/pincode/${pin}`);
      setPinHint(data.message || '');
    } catch {
      setPinHint('');
    }
  }

  async function applyCoupon() {
    const { data } = await api.post('/coupons/preview', { code: form.couponCode, subtotal });
    setCouponOff(data.discount || 0);
  }

  async function applyGift() {
    const due = Math.max(0, subtotal - couponOff + (subtotal - couponOff >= 499 ? 0 : 40));
    const { data } = await api.post('/coupons/gift-preview', { code: form.giftCardCode, amount: due });
    setGiftOff(data.credit || 0);
  }

  function buildPayload(extra: Record<string, unknown> = {}) {
    const payload: Record<string, unknown> = {
      paymentMethod: form.paymentMethod,
      sessionId: getSessionId(),
      couponCode: form.couponCode || undefined,
      giftCardCode: form.giftCardCode || undefined,
      guestEmail: isAuthenticated ? undefined : form.email,
      ...extra,
    };
    if (isAuthenticated && addressId) payload.addressId = addressId;
    else {
      payload.shipping = {
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        line1: form.line1,
        line2: form.line2,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
      };
    }
    return payload;
  }

  async function place(extra: Record<string, unknown> = {}) {
    const { data } = await api.post('/orders', buildPayload(extra));
    await clear();
    await refresh();
    const orderNumber = data.order?.orderNumber;
    if (isAuthenticated) {
      navigate('/account/orders', {
        state: { justPlaced: orderNumber, giftCodes: data.order?.giftCodes || [] },
      });
    } else {
      navigate('/track', {
        state: { orderNumber, phone: form.phone, giftCodes: data.order?.giftCodes || [] },
      });
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const shippingFee = Math.max(0, subtotal - couponOff) >= 499 ? 0 : 40;
      const due = Math.max(0, subtotal - couponOff + shippingFee - giftOff);
      if (form.paymentMethod !== 'cod' && due > 0 && payMode === 'razorpay') {
        const { data: intent } = await api.post('/payments/create-order', { amount: due });
        await loadRazorpay();
        await new Promise<void>((resolve, reject) => {
          const Rzp = window.Razorpay;
          if (!Rzp) {
            reject(new Error('Razorpay unavailable'));
            return;
          }
          const rzp = new Rzp({
            key: rzpKey,
            order_id: intent.orderId,
            amount: intent.amount,
            currency: intent.currency || 'INR',
            name: 'Salem Book House',
            handler: async (response: Record<string, string>) => {
              try {
                await place({
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                  paymentMethod: 'razorpay',
                });
                resolve();
              } catch (err) {
                reject(err);
              }
            },
            modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
            prefill: { name: form.fullName, email: form.email || user?.email, contact: form.phone },
          } as Record<string, unknown>);
          rzp.open();
        });
        return;
      }
      if (form.paymentMethod === 'upi' && payMode === 'simulated' && due > 0 && !form.upiId.trim()) {
        throw new Error('Enter a UPI ID');
      }
      await place();
    } catch (err) {
      setError(err.message || 'Checkout failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Preparing checkout…" />;
  if (!items.length) {
    return (
      <div className="container">
        <EmptyState title="Nothing to checkout" message="Your cart is empty." action={<Link to="/shop">Shop books</Link>} />
      </div>
    );
  }

  const shipping = Math.max(0, subtotal - couponOff) >= 499 ? 0 : 40;
  const total = Math.max(0, subtotal - couponOff + shipping - giftOff);
  const payOptions = [
    { id: 'cod', label: 'Cash on Delivery' },
    { id: 'upi', label: payMode === 'razorpay' ? 'UPI (Razorpay)' : 'UPI (simulated)' },
    { id: 'card', label: payMode === 'razorpay' ? 'Cards (Razorpay)' : 'Debit / Credit card (simulated)' },
    { id: 'netbanking', label: payMode === 'razorpay' ? 'Net banking (Razorpay)' : 'Net banking (simulated)' },
  ];

  return (
    <div className="checkout-page container">
      <h1>Checkout</h1>
      {!isAuthenticated ? (
        <p className="notice">Guest checkout is available — or <Link to="/login">login</Link> to use saved addresses.</p>
      ) : null}
      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={onSubmit}>
          <h2>Shipping Address</h2>
          {!isAuthenticated ? (
            <label>
              Email
              <input name="email" type="email" required value={form.email} onChange={onChange} />
            </label>
          ) : null}
          {addresses.length ? (
            <label>
              Saved address
              <select value={addressId} onChange={(e) => setAddressId(e.target.value)}>
                <option value="">New address</option>
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName} — {a.line1}, {a.pincode}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {!addressId ? (
            <>
              <label>
                Full Name
                <input name="fullName" required value={form.fullName} onChange={onChange} />
              </label>
              <label>
                Phone
                <input name="phone" required value={form.phone} onChange={onChange} />
              </label>
              <label>
                Address Line 1
                <input name="line1" required value={form.line1} onChange={onChange} />
              </label>
              <label>
                Address Line 2
                <input name="line2" value={form.line2} onChange={onChange} />
              </label>
              <div className="form-row">
                <label>
                  City
                  <input name="city" required value={form.city} onChange={onChange} />
                </label>
                <label>
                  State
                  <input name="state" required value={form.state} onChange={onChange} />
                </label>
                <label>
                  Pincode
                  <input name="pincode" required value={form.pincode} onChange={onChange} onBlur={onPinBlur} />
                </label>
              </div>
              {pinHint ? <p className="pin-msg">{pinHint}</p> : null}
            </>
          ) : null}
          <h2>Offers</h2>
          <label>
            Coupon
            <input name="couponCode" value={form.couponCode} onChange={onChange} placeholder="WELCOME10" />
          </label>
          <button type="button" className="btn btn-outline" onClick={() => applyCoupon().catch((e) => setError(e.message))}>
            Apply coupon
          </button>
          <label>
            Gift card
            <input name="giftCardCode" value={form.giftCardCode} onChange={onChange} placeholder="SBH-…" />
          </label>
          <button type="button" className="btn btn-outline" onClick={() => applyGift().catch((e) => setError(e.message))}>
            Apply gift card
          </button>
          <h2>Payment</h2>
          <p className="muted">
            {payMode === 'razorpay'
              ? 'Online methods open Razorpay Checkout.'
              : 'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the API for live UPI/cards. Until then online pay is simulated.'}
          </p>
          {payOptions.map((p) => (
            <label key={p.id} className="radio-line">
              <input type="radio" name="paymentMethod" value={p.id} checked={form.paymentMethod === p.id} onChange={onChange} />
              {p.label}
            </label>
          ))}
          {form.paymentMethod === 'upi' && payMode !== 'razorpay' ? (
            <label>
              UPI ID
              <input name="upiId" value={form.upiId} onChange={onChange} placeholder="name@upi" />
            </label>
          ) : null}
          {form.paymentMethod === 'card' && payMode !== 'razorpay' ? (
            <>
              <label>
                Card number
                <input name="cardNumber" value={form.cardNumber} onChange={onChange} />
              </label>
              <label>
                Name on card
                <input name="cardName" value={form.cardName} onChange={onChange} />
              </label>
              <div className="form-row">
                <label>
                  Expiry
                  <input name="cardExpiry" value={form.cardExpiry} onChange={onChange} placeholder="MM/YY" />
                </label>
                <label>
                  CVV
                  <input name="cardCvv" value={form.cardCvv} onChange={onChange} />
                </label>
              </div>
            </>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="btn btn-gold" disabled={busy}>
            {busy ? 'Placing order…' : `Place Order · ${formatPrice(total)}`}
          </button>
        </form>
        <aside className="cart-summary">
          <h2>Your Order</h2>
          <ul className="checkout-lines">
            {items.map((item) => (
              <li key={item.id}>
                <span>
                  {(item.book || item).title} × {item.quantity}
                </span>
                <span>
                  {formatPrice(
                    Number(item.unit_price ?? item.book?.sale_price ?? item.book?.salePrice ?? 0) * (item.quantity || 1)
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="summary-row">
            <span>Subtotal</span>
            <strong>{formatPrice(subtotal)}</strong>
          </div>
          {couponOff ? (
            <div className="summary-row">
              <span>Coupon</span>
              <strong>-{formatPrice(couponOff)}</strong>
            </div>
          ) : null}
          <div className="summary-row">
            <span>Shipping</span>
            <strong>{shipping === 0 ? 'Free' : formatPrice(shipping)}</strong>
          </div>
          {giftOff ? (
            <div className="summary-row">
              <span>Gift card</span>
              <strong>-{formatPrice(giftOff)}</strong>
            </div>
          ) : null}
          <div className="summary-row">
            <span>Total</span>
            <strong>{formatPrice(total)}</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}
