import crypto from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import {
  requireAuth,
  signToken,
  setAuthCookie,
  clearAuthCookie,
} from '../middleware/auth.js';
import { sendMail, mailConfigured } from '../mailer.js';

const router = Router();

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    createdAt: u.created_at,
  };
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ success: false, error: 'Name, email and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Enter a valid email address' });
    }

    const existing = await query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email.trim()]);
    if (existing.rows[0]) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, phone, role, created_at`,
      [name.trim(), email.trim().toLowerCase(), passwordHash, phone || null]
    );

    const token = signToken(rows[0].id);
    setAuthCookie(res, token);
    return res.status(201).json({
      success: true,
      data: { user: publicUser(rows[0]), token },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const { rows } = await query(
      `SELECT id, name, email, phone, role, created_at, password_hash
       FROM users WHERE lower(email) = lower($1)`,
      [email.trim()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = signToken(user.id);
    setAuthCookie(res, token);
    const { password_hash: _, ...safe } = user;
    return res.json({
      success: true,
      data: { user: publicUser(safe), token },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Login failed' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  return res.json({ success: true, data: { user: publicUser(req.user) } });
});

router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { name, phone } = req.body || {};
    const { rows } = await query(
      `UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone) WHERE id = $3
       RETURNING id, name, email, phone, role, created_at`,
      [name?.trim() || null, phone?.trim() || null, req.user.id]
    );
    return res.json({ success: true, data: { user: publicUser(rows[0]) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not update profile' });
  }
});

router.post('/forgot', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });
    const { rows } = await query(`SELECT id FROM users WHERE lower(email) = $1`, [email]);
    const payload = {
      message: mailConfigured()
        ? 'If that email is registered, a reset link has been sent.'
        : 'If that email is registered, a reset link has been sent.',
    };
    if (rows[0]) {
      const token = crypto.randomBytes(24).toString('hex');
      await query(
        `INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1,$2, NOW() + INTERVAL '2 hours')`,
        [rows[0].id, token]
      );
      const origin = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0];
      const resetPath = `/reset-password?token=${token}`;
      await sendMail({
        to: email,
        subject: 'Reset your Salem Book House password',
        text: `Reset your password: ${origin}${resetPath}`,
      });
      if (!mailConfigured()) {
        console.warn('Password reset requested but SMTP is not configured; no email was sent.');
      }
    }
    return res.json({ success: true, data: payload });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not start password reset' });
  }
});

router.post('/reset', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password || String(password).length < 6) {
      return res.status(400).json({ success: false, error: 'Valid token and password (6+ characters) are required' });
    }
    const { rows } = await query(
      `SELECT * FROM password_resets WHERE token = $1 AND used = FALSE AND expires_at > NOW()`,
      [token]
    );
    if (!rows[0]) return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    const hash = await bcrypt.hash(password, 10);
    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, rows[0].user_id]);
    await query(`UPDATE password_resets SET used = TRUE WHERE id = $1`, [rows[0].id]);
    return res.json({ success: true, data: { message: 'Password updated. You can sign in now.' } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not reset password' });
  }
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  return res.json({ success: true, data: { message: 'Logged out' } });
});

export default router;
