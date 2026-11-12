import { query } from '../db/pool.js';

/**
 * Limits that do not depend on the caller's IP address, so they still hold if someone
 * reaches the API directly and fakes X-Forwarded-For.
 */

// ---- Per-account login lock (in memory, per API instance) ----
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS || 10);
const fails = new Map(); // email -> { count, first }

const keyOf = (email) => String(email || '').trim().toLowerCase();

export function loginLocked(email) {
  const k = keyOf(email);
  const f = fails.get(k);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) { fails.delete(k); return false; }
  return f.count >= MAX_FAILS;
}

export function recordLoginFailure(email) {
  const k = keyOf(email);
  const now = Date.now();
  const f = fails.get(k);
  if (!f || now - f.first > WINDOW_MS) fails.set(k, { count: 1, first: now });
  else f.count += 1;
  if (fails.size > 5000) { // bound memory
    for (const [key, v] of fails) if (now - v.first > WINDOW_MS) fails.delete(key);
    if (fails.size > 5000) fails.clear();
  }
}

export function clearLoginFailures(email) {
  fails.delete(keyOf(email));
}

export function resetLoginLocksForTests() {
  fails.clear();
}

// ---- Site-wide daily caps (database counts) ----
export async function signupCapReached() {
  const cap = Number(process.env.SIGNUP_DAILY_CAP || 500);
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM users WHERE created_at > NOW() - INTERVAL '24 hours'");
  return rows[0].n >= cap;
}

/** Only unpaid cash-on-delivery orders are capped; paid online orders are not abuse-prone. */
export async function codOrderCapReached() {
  const cap = Number(process.env.COD_DAILY_CAP || 300);
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM orders WHERE payment_method = 'cod' AND created_at > NOW() - INTERVAL '24 hours'");
  return rows[0].n >= cap;
}

// ---- One account per phone number; verified email before ordering ----
const digits10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

/** True when another account already uses this phone number (compared on the last 10 digits). */
export async function phoneTaken(phone, exceptUserId = null) {
  const d = digits10(phone);
  if (d.length < 10) return false;
  const { rows } = await query(
    `SELECT 1 FROM users
      WHERE right(regexp_replace(COALESCE(phone,''), '\\D', '', 'g'), 10) = $1
        AND ($2::uuid IS NULL OR id <> $2::uuid) LIMIT 1`,
    [d, exceptUserId]
  );
  return rows.length > 0;
}

export const PHONE_TAKEN_MESSAGE = 'This phone number is already linked to another account. Sign in to that account or use a different number.';

/** Customers must verify their email before placing an order or paying. Staff and guests are not affected. */
export function emailVerificationRequired(user) {
  return Boolean(user && user.role === 'customer' && !user.email_verified_at);
}

export const VERIFY_BEFORE_ORDER_MESSAGE = 'Please verify your email address before placing an order. We sent you a verification link; use "Resend" on the banner if you need a new one.';
