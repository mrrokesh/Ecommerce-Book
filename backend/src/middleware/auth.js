import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';

function extractToken(req) {
  const header = String(req.headers.authorization || req.headers.Authorization || '');
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
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
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function setAuthCookie(res, token) {
  res.cookie('token', token, cookieOpts());
}

export function clearAuthCookie(res) {
  res.clearCookie('token', cookieOpts());
}
