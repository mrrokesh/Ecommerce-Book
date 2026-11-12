import {decryptSecret,verifyTotp} from '../domain/totp.js';
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
import { sendMail, mailConfigured, mailBudgetOk } from '../mailer.js';
import { welcomeEmail, signInAlert, passwordChangedEmail, verifyEmailMail } from '../notify/accountMail.js';
import rateLimit from 'express-rate-limit';

const router = Router();

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    createdAt: u.created_at,
    emailVerified: Boolean(u.email_verified_at),
  };
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ success: false, error: 'Name, email and password are required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Enter a valid email address' });
    }
    const emailNorm = email.trim().toLowerCase();
    const reservedAdmin = (process.env.ADMIN_EMAIL || 'admin@salembookhouse.com').toLowerCase();
    if (emailNorm === reservedAdmin) {
      return res.status(400).json({ success: false, error: 'This email cannot be used for registration' });
    }

    const existing = await query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [emailNorm]);
    if (existing.rows[0]) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, phone, role, created_at, email_verified_at`,
      [name.trim(), emailNorm, passwordHash, phone || null]
    );

    const token = signToken(rows[0].id, 0);
    setAuthCookie(res, token);
    sendVerification(rows[0], req);
    return res.status(201).json({
      success: true,
      data: { user: publicUser(rows[0]) },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, error: 'Too many attempts. Please wait and try again.' } });

/** Create a single-use 24h token (older unused ones are invalidated) and email the link. */
export async function sendVerification(user, _req) {
  try {
    if (!(await mailBudgetOk(user.email, 'Verify your', { perRecipient: 5 }))) return;
    const raw = crypto.randomBytes(24).toString('hex');
    await query('UPDATE email_verifications SET used = TRUE WHERE user_id = $1 AND used = FALSE', [user.id]);
    await query("INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES ($1,$2, NOW() + INTERVAL '24 hours')", [user.id, hashToken(raw)]);
    await verifyEmailMail(user, raw);
  } catch (err) {
    console.warn('verification email:', err.message);
  }
}

router.post('/verify-email', verifyLimiter, async (req, res) => {
  try {
    const token = String(req.body?.token || '');
    if (!token) return res.status(400).json({ success: false, error: 'Verification token is required' });
    const { rows } = await query(
      'UPDATE email_verifications SET used = TRUE WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW() RETURNING user_id',
      [hashToken(token)]
    );
    if (!rows[0]) return res.status(400).json({ success: false, error: 'This verification link is invalid or has expired' });
    const u = await query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1 RETURNING id, name, email', [rows[0].user_id]);
    welcomeEmail(u.rows[0]);
    return res.json({ success: true, data: { verified: true } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Could not verify email' });
  }
});

router.post('/resend-verification', verifyLimiter, requireAuth, async (req, res) => {
  if (req.user.email_verified_at) return res.json({ success: true, data: { verified: true } });
  await sendVerification(req.user, req);
  return res.json({ success: true, data: { sent: true } });
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const { rows } = await query(
      `SELECT id, name, email, phone, role, created_at, password_hash, token_version, mfa_secret, email_verified_at
       FROM users WHERE lower(email) = lower($1)`,
      [email.trim()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    if(user.mfa_secret&&!verifyTotp(decryptSecret(user.mfa_secret),req.body.code))return res.status(401).json({success:false,error:'Enter a valid authenticator code'});
    const token = signToken(user.id, user.token_version);
    setAuthCookie(res, token);
    const { password_hash: _, ...safe } = user;
    if (user.role === 'customer') signInAlert(user, req);
    return res.json({
      success: true,
      data: { user: publicUser(safe) },
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
       RETURNING id, name, email, phone, role, created_at, email_verified_at`,
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
    if (rows[0] && (await mailBudgetOk(email, 'Reset your Salem', { perRecipient: 3 }))) {
      const token = crypto.randomBytes(24).toString('hex');
      await query(
        `INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1,$2, NOW() + INTERVAL '2 hours')`,
        [rows[0].id, hashToken(token)]
      );
      const origin = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0];
      const resetPath = `/reset-password?token=${token}`;
      await sendMail({
        to: email,
        subject: 'Reset your Salem Book House password',
        text: `Reset your password: ${origin}${resetPath}`,
      });
      if (!mailConfigured()) {
        console.warn('Password reset requested but no email provider is configured; no email was sent (set ROKESH_NOTIFY_API_URL/KEY or SMTP_*).');
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
    if (!token || !password || String(password).length < 8) {
      return res.status(400).json({ success: false, error: 'Valid token and password (8+ characters) are required' });
    }
    const { rows } = await query(
      `SELECT * FROM password_resets WHERE token = $1 AND used = FALSE AND expires_at > NOW()`,
      [hashToken(token)]
    );
    if (!rows[0]) return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    const hash = await bcrypt.hash(password, 10);
    await query(
      `UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2`,
      [hash, rows[0].user_id]
    );
    await query(`UPDATE password_resets SET used = TRUE WHERE id = $1`, [rows[0].id]);
    query('SELECT name, email FROM users WHERE id = $1', [rows[0].user_id]).then((r) => passwordChangedEmail(r.rows[0])).catch(() => {});
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
