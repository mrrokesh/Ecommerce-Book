import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';

export const AUTH_COOKIE = 'sbh_auth';

function extractToken(req) {
  const header = String(req.headers.authorization || req.headers.Authorization || '');
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  if (req.cookies?.[AUTH_COOKIE]) {
    return req.cookies[AUTH_COOKIE];
  }
  // Legacy cookie name during migration
  if (req.cookies?.token) {
    return req.cookies.token;
  }
  return null;
}

export async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query(
      `SELECT id, name, email, phone, role, created_at FROM users WHERE id = $1`,
      [payload.sub]
    );
    if (!rows[0]) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

export async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    next();
  });
}

/** Admin portal roles: 'admin' has full access, 'staff' may only manage orders. */
export const BACK_OFFICE_ROLES = ['admin', 'staff'];

export async function requireBackOffice(req, res, next) {
  await requireAuth(req, res, () => {
    if (!BACK_OFFICE_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    next();
  });
}

export async function optionalAuth(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) return next();
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query(
      `SELECT id, name, email, phone, role, created_at FROM users WHERE id = $1`,
      [payload.sub]
    );
    if (rows[0]) req.user = rows[0];
  } catch {
    // ignore invalid token for optional auth
  }
  next();
}

export function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function cookieOpts() {
  const crossSite = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: crossSite ? 'none' : 'lax',
    secure: crossSite,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function setAuthCookie(res, token) {
  const opts = cookieOpts();
  res.cookie(AUTH_COOKIE, token, opts);
  // Clear legacy cookie if present
  res.clearCookie('token', { ...opts, maxAge: 0 });
}

export function clearAuthCookie(res) {
  const opts = cookieOpts();
  res.clearCookie(AUTH_COOKIE, opts);
  res.clearCookie('token', opts);
}
