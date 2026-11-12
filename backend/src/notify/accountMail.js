import { query } from '../db/pool.js';
import { sendMail } from '../mailer.js';

const STORE = 'Salem Book House';
const base = () => String(process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');
const rupees = (n) => 'Rs. ' + Number(n || 0).toFixed(2);

/** Every helper is best-effort: a mail failure must never break sign-in, checkout or refunds. */
async function safe(label, to, subject, text) {
  if (!to) return;
  try {
    await sendMail({ to, subject, text: `${text}\n\n— ${STORE}\n${base()}` });
  } catch (err) {
    console.warn(`${label} email:`, err.message);
  }
}

export const welcomeEmail = (user) =>
  safe('welcome', user?.email, `Welcome to ${STORE}`,
    `Hi ${user?.name || 'there'},\n\nYour account is ready. Browse books, track orders and save addresses any time at ${base()}/shop.`);

export const verifyEmailMail = (user, token) =>
  safe('verify', user?.email, `Verify your ${STORE} email`,
    `Hi ${user?.name || 'there'},

Confirm your email address to finish setting up your account (link valid for 24 hours):
${base()}/verify-email?token=${token}

If you did not create this account, ignore this email.`);

export const signInAlert = (user, req) => {
  const ip = req?.ip || 'unknown';
  const when = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  return safe('sign-in', user?.email, `New sign-in to your ${STORE} account`,
    `Hi ${user?.name || 'there'},\n\nYour account was signed in on ${when} (IP ${ip}).\nIf this was not you, reset your password now: ${base()}/forgot-password`);
};

export const passwordChangedEmail = (user) =>
  safe('password-changed', user?.email, `Your ${STORE} password was changed`,
    `Hi ${user?.name || 'there'},\n\nYour password was just changed and all other sessions were signed out.\nIf this was not you, reset it immediately: ${base()}/forgot-password`);

async function orderContact(orderId) {
  const { rows } = await query(
    `SELECT o.order_number, o.total, COALESCE(u.email, o.guest_email) AS email, COALESCE(u.name, o.shipping_name) AS name
       FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1`, [orderId]);
  return rows[0] || null;
}

const RETURN_TEXT = {
  requested: 'We received your return request and will review it shortly.',
  approved: 'Your return was approved. We will arrange the pickup.',
  declined: 'Your return request could not be approved.',
  received: 'We received and inspected your returned items. Any refund has been started.',
};

export async function returnUpdateEmail(orderId, status, note) {
  try {
    const c = await orderContact(orderId);
    if (!c) return;
    await safe('return', c.email, `Return update for order ${c.order_number}`,
      `Hi ${c.name || 'there'},\n\n${RETURN_TEXT[status] || 'Your return was updated.'}${note && status !== 'requested' ? `\nNote: ${note}` : ''}`);
  } catch (err) { console.warn('return email:', err.message); }
}

export async function refundUpdateEmail(orderId, amount, status) {
  if (!orderId || !['completed', 'failed'].includes(status)) return;
  try {
    const c = await orderContact(orderId);
    if (!c) return;
    const text = status === 'completed'
      ? `Hi ${c.name || 'there'},\n\nYour refund of ${rupees(amount)} for order ${c.order_number} has been processed. It can take 5–7 working days to show in your account.`
      : `Hi ${c.name || 'there'},\n\nWe could not complete your refund of ${rupees(amount)} for order ${c.order_number} yet. Our team is looking into it and will retry.`;
    await safe('refund', c.email, `Refund update for order ${c.order_number}`, text);
  } catch (err) { console.warn('refund email:', err.message); }
}
