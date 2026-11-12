import { firstError, checks } from '../utils/validate.js';
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
import { welcomeEmail, signInAlert, passwordChangedEmail, verifyEmailMail, passwordResetEmail } from '../notify/accountMail.js';
import rateLimit from 'express-rate-limit';
import { loginLocked, recordLoginFailure, clearLoginFailures, signupCapReached, phoneTaken, PHONE_TAKEN_MESSAGE } from '../utils/abuseGuard.js';

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
    marketingOptIn: Boolean(u.marketing_opt_in),
  };
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, marketingOptIn } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ success: false, error: 'Name, email and password are required' });
    }
    {
      const bad = firstError([['name', name, 'Name'], ['phone', phone, 'Phone', { skipEmpty: true }], ['password', password]]);
      if (bad) return res.status(400).json({ success: false, error: bad });
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

    if (phone && (await phoneTaken(phone))) {
      return res.status(409).json({ success: false, error: PHONE_TAKEN_MESSAGE });
    }
    if (await signupCapReached()) {
      return res.status(429).json({ success: false, error: 'Sign-ups are busy right now. Please try again later.' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, phone, marketing_opt_in, marketing_consent_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN NOW() END)
       RETURNING id, name, email, phone, role, created_at, email_verified_at, marketing_opt_in`,
      [name.trim(), emailNorm, passwordHash, phone || null, marketingOptIn === true]
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

/** One-click unsubscribe from promotional email (no sign-in needed; the token comes from the email footer). */
router.post('/unsubscribe', verifyLimiter, async (req, res) => {
  const token = String(req.body?.token || '');
  if (!/^[0-9a-f]{32}$/.test(token)) return res.status(400).json({ success: false, error: 'This unsubscribe link is not valid' });
  const fromUsers = await query('UPDATE users SET marketing_opt_in = FALSE WHERE unsubscribe_token = $1 RETURNING lower(email) AS email', [token]);
  const fromList = await query(
    `UPDATE marketing_subscribers SET active = FALSE, unsubscribed_at = NOW()
      WHERE unsubscribe_token = $1 OR lower(email) = ANY($2::text[]) RETURNING lower(email) AS email`,
    [token, fromUsers.rows.map((r) => r.email)]);
  if (fromList.rows.length) await query('UPDATE users SET marketing_opt_in = FALSE WHERE lower(email) = ANY($1::text[])', [fromList.rows.map((r) => r.email)]);
  return res.json({ success: true, data: { unsubscribed: true } });
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const { rows } = await query(
      `SELECT id, name, email, phone, role, created_at, password_hash, token_version, mfa_secret, email_verified_at, marketing_opt_in
       FROM users WHERE lower(email) = lower($1)`,
      [email.trim()]
    );
    const user = rows[0];
    if (loginLocked(email)) {
      return res.status(429).json({ success: false, error: 'Too many failed sign-in attempts for this account. Please wait 15 minutes or reset your password.' });
    }
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      recordLoginFailure(email);
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }
    clearLoginFailures(email);

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
    const { name, phone, marketingOptIn } = req.body || {};
    {
      const bad = firstError([['name', name, 'Name', { skipEmpty: true }], ['phone', phone, 'Phone', { skipEmpty: true }]]);
      if (bad) return res.status(400).json({ success: false, error: bad });
    }
    if (phone?.trim() && (await phoneTaken(phone, req.user.id))) {
      return res.status(409).json({ success: false, error: PHONE_TAKEN_MESSAGE });
    }
    const { rows } = await query(
      `UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone),
         marketing_opt_in = COALESCE($4::boolean, marketing_opt_in),
         marketing_consent_at = CASE WHEN $4::boolean IS TRUE AND NOT marketing_opt_in THEN NOW() ELSE marketing_consent_at END
       WHERE id = $3
       RETURNING id, name, email, phone, role, created_at, email_verified_at, marketing_opt_in`,
      [name?.trim() || null, phone?.trim() || null, req.user.id, typeof marketingOptIn === 'boolean' ? marketingOptIn : null]
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
    const { rows } = await query(`SELECT id, name FROM users WHERE lower(email) = $1`, [email]);
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
      await passwordResetEmail({ name: rows[0].name, email }, token);
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
    if (!token || !password || checks.password(password)) {
      return res.status(400).json({ success: false, error: 'A valid token and a password of 8+ characters with a letter and a number are required' });
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
