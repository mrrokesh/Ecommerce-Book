import { query } from '../db/pool.js';
import { sendMail } from '../mailer.js';
import { renderEmail, rupeesHtml, siteBase } from './emailTemplate.js';

const STORE = 'Salem Book House';

/** Every helper is best-effort: a mail failure must never break sign-in, checkout or refunds. */
async function deliver(label, to, subject, content) {
  if (!to) return;
  try {
    const { html, text } = renderEmail(content);
    await sendMail({ to, subject, text, html });
  } catch (err) {
    console.warn(`${label} email:`, err.message);
  }
}

const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

/** Describe an active coupon for an email, straight from the store's coupon table. Null when it is missing, off or expired. */
export async function couponOffer(code) {
  try {
    const { rows } = await query(
      `SELECT code, description, percent_off, amount_off, min_order, expires_at FROM coupons
        WHERE upper(code) = upper($1) AND active = TRUE AND (expires_at IS NULL OR expires_at > NOW())`,
      [String(code || '').trim()]
    );
    const c = rows[0];
    if (!c) return null;
    const percent = Number(c.percent_off);
    const amount = Number(c.amount_off);
    const min = Number(c.min_order);
    return {
      code: c.code,
      headline: percent > 0 ? `${percent}% off your order` : amount > 0 ? `Rs. ${amount} off your order` : 'A special gift for you',
      detail: min > 0 ? `Valid on orders above Rs. ${min}.` : 'No minimum order.',
      expires: c.expires_at ? `Valid until ${new Date(c.expires_at).toISOString().slice(0, 10)}` : 'Apply it at checkout.',
      eyebrow: 'Your offer code',
    };
  } catch {
    return null;
  }
}

const welcomeCoupon = async () => {
  const offer = await couponOffer((process.env.WELCOME_COUPON || 'WELCOME10').trim());
  return offer ? { ...offer, eyebrow: 'Your welcome offer', headline: offer.headline.replace('your order', 'your first order') } : null;
};

export async function welcomeEmail(user) {
  const coupon = await welcomeCoupon();
  return deliver('welcome', user?.email, `Welcome to ${STORE}${coupon ? ` - here's ${coupon.code}` : ''}`, {
    badge: 'Welcome',
    title: `Welcome to ${STORE}, ${first(user?.name)}!`,
    preheader: coupon ? `Your welcome offer: ${coupon.headline} with code ${coupon.code}` : 'Your account is ready.',
    greeting: `Hi ${first(user?.name)},`,
    paragraphs: [
      'Your account is ready. Browse thousands of books, from school and exam guides to Tamil literature and bestsellers, and have them delivered to your door.',
      coupon ? 'To say thank you, here is a gift for your first order:' : 'Track orders, save addresses and check out faster any time.',
    ],
    coupon: coupon || undefined,
    cta: { label: 'Start shopping', url: `${siteBase()}/shop/books` },
    note: 'Questions? Just open Contact us on our website and we will help.',
  });
}

export const verifyEmailMail = (user, token) =>
  deliver('verify', user?.email, `Verify your ${STORE} email`, {
    badge: 'Confirm your email',
    title: 'Verify your email address',
    preheader: 'One quick step to finish setting up your account.',
    greeting: `Hi ${first(user?.name)},`,
    paragraphs: ['Please confirm this email address to finish setting up your account. This link is valid for 24 hours.'],
    cta: { label: 'Verify my email', url: `${siteBase()}/verify-email?token=${token}` },
    note: 'If you did not create this account, you can safely ignore this email.',
  });

export const passwordResetEmail = (user, token) =>
  deliver('password-reset', user?.email, `Reset your ${STORE} password`, {
    badge: 'Password reset',
    title: 'Reset your password',
    preheader: 'Use this link to choose a new password. It expires in 2 hours.',
    greeting: `Hi ${first(user?.name)},`,
    paragraphs: ['We received a request to reset the password for your account. Choose a new one with the button below. For your security this link works once and expires in 2 hours.'],
    cta: { label: 'Choose a new password', url: `${siteBase()}/reset-password?token=${token}` },
    note: 'If you did not ask for this, you can ignore this email; your password will not change.',
  });

export const signInAlert = (user, req) => {
  const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  return deliver('sign-in', user?.email, `New sign-in to your ${STORE} account`, {
    badge: 'Security',
    title: 'New sign-in to your account',
    preheader: 'We noticed a new sign-in. Was this you?',
    greeting: `Hi ${first(user?.name)},`,
    paragraphs: ['Your account was just signed in. If this was you, there is nothing to do.'],
    details: [
      { label: 'When', value: when },
      { label: 'IP address', value: req?.ip || 'unknown' },
    ],
    cta: { label: 'This was not me - secure my account', url: `${siteBase()}/forgot-password` },
    note: 'Resetting your password signs out every other session.',
  });
};

export const passwordChangedEmail = (user) =>
  deliver('password-changed', user?.email, `Your ${STORE} password was changed`, {
    badge: 'Security',
    title: 'Your password was changed',
    preheader: 'Your password was just changed and other sessions were signed out.',
    greeting: `Hi ${first(user?.name)},`,
    paragraphs: ['Your password was just changed and all other sessions were signed out.'],
    cta: { label: 'I did not do this', url: `${siteBase()}/forgot-password` },
    note: 'If this was you, no action is needed.',
  });

async function orderContact(orderId) {
  const { rows } = await query(
    `SELECT o.order_number, o.total, o.user_id, COALESCE(u.email, o.guest_email) AS email, COALESCE(u.name, o.shipping_name) AS name
       FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1`, [orderId]);
  return rows[0] || null;
}

const orderLink = (c) => (c?.user_id ? `${siteBase()}/account/orders` : `${siteBase()}/guest-order`);

const RETURN_COPY = {
  requested: ['Return requested', 'We received your return request', 'We will review it shortly and email you the next step.'],
  approved: ['Return approved', 'Your return was approved', 'We will arrange the pickup. Please keep the items unused and in their original packing.'],
  declined: ['Return not approved', 'Your return could not be approved', 'The reason is noted below. Reply from your account if you have questions.'],
  received: ['Return received', 'We received your returned items', 'Our team inspected them and any refund has now been started.'],
};

export async function returnUpdateEmail(orderId, status, note) {
  try {
    const c = await orderContact(orderId);
    if (!c) return;
    const [badge, title, line] = RETURN_COPY[status] || ['Return update', 'Your return was updated', ''];
    await deliver('return', c.email, `${title} - order ${c.order_number}`, {
      badge,
      title,
      preheader: `${title} for order ${c.order_number}`,
      greeting: `Hi ${first(c.name)},`,
      paragraphs: [line],
      details: [
        { label: 'Order', value: c.order_number },
        ...(note && status !== 'requested' ? [{ label: 'Note', value: note }] : []),
      ],
      cta: { label: 'View my order', url: orderLink(c) },
    });
  } catch (err) { console.warn('return email:', err.message); }
}

export async function refundUpdateEmail(orderId, amount, status) {
  if (!orderId || !['completed', 'failed'].includes(status)) return;
  try {
    const c = await orderContact(orderId);
    if (!c) return;
    const ok = status === 'completed';
    await deliver('refund', c.email, `Refund update for order ${c.order_number}`, {
      badge: ok ? 'Refund processed' : 'Refund delayed',
      title: ok ? 'Your refund has been processed' : 'We are still working on your refund',
      preheader: ok ? `Your refund for order ${c.order_number} is on its way.` : 'Your refund needs a little more time.',
      greeting: `Hi ${first(c.name)},`,
      paragraphs: [
        ok
          ? 'Your refund has been processed. It can take 5 to 7 working days to show in your account, depending on your bank.'
          : 'We could not complete your refund just yet. Our team is looking into it and will retry; you do not need to do anything.',
      ],
      details: [
        { label: 'Order', value: c.order_number },
        { label: 'Refund amount', value: rupeesHtml(amount), html: true },
      ],
      cta: { label: 'View my order', url: orderLink(c) },
    });
  } catch (err) { console.warn('refund email:', err.message); }
}

/** Order placed: itemised receipt. Called after the order is committed. */
export async function orderConfirmationEmail(orderId, { giftCodes = [] } = {}) {
  try {
    const { rows } = await query(
      `SELECT o.*, COALESCE(u.email, o.guest_email) AS email, COALESCE(u.name, o.shipping_name) AS name
         FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1`, [orderId]);
    const o = rows[0];
    if (!o) return;
    const items = (await query('SELECT title, quantity, unit_price, line_total FROM order_items WHERE order_id = $1 ORDER BY id', [orderId])).rows;
    const totals = [
      { label: 'Subtotal', value: o.subtotal },
      ...(Number(o.discount) > 0 ? [{ label: 'Discount', value: o.discount, negative: true }] : []),
      ...(Number(o.gift_credit) > 0 ? [{ label: 'Gift card', value: o.gift_credit, negative: true }] : []),
      { label: 'Delivery', value: o.shipping },
      { label: 'Total', value: o.total, strong: true },
    ];
    await deliver('order', o.email, `Order ${o.order_number} confirmed - thank you!`, {
      badge: 'Order confirmed',
      title: 'Thank you for your order!',
      preheader: `Order ${o.order_number} is confirmed.`,
      greeting: `Hi ${first(o.name)},`,
      paragraphs: [
        'We have received your order and are getting it ready. We will email you again when it ships.',
        ...(giftCodes.length ? [`Your gift card code${giftCodes.length > 1 ? 's are' : ' is'}: ${giftCodes.map((g) => g.code).join(', ')}`] : []),
      ],
      step: 0,
      details: [
        { label: 'Order number', value: o.order_number },
        { label: 'Payment', value: String(o.payment_method || '').toUpperCase() === 'COD' ? 'Cash on delivery' : 'Paid online' },
        { label: 'Deliver to', value: [o.shipping_name, o.shipping_address].filter(Boolean).join(', ') },
      ],
      items: items.map((i) => ({ title: i.title, quantity: i.quantity, lineTotal: i.line_total })),
      totals,
      cta: { label: o.user_id ? 'View my order' : 'View my order', url: orderLink(o) },
      note: o.invoice_number ? `Invoice ${o.invoice_number} is available in your order page.` : undefined,
    });
  } catch (err) { console.warn('order email:', err.message); }
}
