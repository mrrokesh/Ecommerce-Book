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
      `SELECT id, name, email, phone, role, created_at, token_version, email_verified_at FROM users WHERE id = $1`,
      [payload.sub]
    );
    if (!rows[0]) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }
    // A password reset bumps token_version, which ends every session issued before it.
    if (Number(payload.tv ?? 0) !== Number(rows[0].token_version ?? 0)) {
      return res.status(401).json({ success: false, error: 'Session expired. Please sign in again.' });
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

/** Admin portal roles: 'admin' has full access, 'staff' gets the modules of their staff role. */
export const BACK_OFFICE_ROLES = ['admin', 'staff'];

/** Admin portal modules a staff role can be granted. Staff and role management stay admin-only. */
export const ADMIN_MODULES = [
  'dashboard',
  'products',
  'categories',
  'orders',
  'customers',
  'reviews',
  'shipping',
  'marketing',
  'emails',
  'support',
  'refunds',
  'orders_edit',
  'products_edit',
];

export async function loadPermissions(user) {
  if (!user) return [];
  if (user.role === 'admin') return [...ADMIN_MODULES];
  if (user.role !== 'staff') return [];
  const { rows } = await query(
    `SELECT r.permissions FROM users u JOIN staff_roles r ON r.id = u.staff_role_id WHERE u.id = $1`,
    [user.id]
  );
  return (rows[0]?.permissions || []).filter((p) => ADMIN_MODULES.includes(p));
}

export async function requireBackOffice(req, res, next) {
  await requireAuth(req, res, async () => {
    if (!BACK_OFFICE_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    try {
      req.permissions = await loadPermissions(req.user);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Could not load permissions' });
    }
    next();
  });
}

/** Allows admins, and staff whose role includes any of the given modules. */
export function requirePermission(...modules) {
  return (req, res, next) =>
    requireBackOffice(req, res, () => {
      if (!modules.some((m) => req.permissions.includes(m))) {
        return res.status(403).json({ success: false, error: 'You do not have access to this section' });
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
      `SELECT id, name, email, phone, role, created_at, token_version, email_verified_at FROM users WHERE id = $1`,
      [payload.sub]
    );
    if (rows[0] && Number(payload.tv ?? 0) === Number(rows[0].token_version ?? 0)) req.user = rows[0];
  } catch {
    // ignore invalid token for optional auth
  }
  next();
}

export function signToken(userId, tokenVersion = 0) {
  return jwt.sign({ sub: userId, tv: Number(tokenVersion) || 0 }, process.env.JWT_SECRET, {
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
