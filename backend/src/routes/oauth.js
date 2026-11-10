import crypto from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { signToken, setAuthCookie } from '../middleware/auth.js';

const router = Router();

const STATE_COOKIE = 'sbh_oauth';
const FB_VERSION = 'v27.0';

const PROVIDERS = {
  google: {
    enabled: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    idColumn: 'google_id',
    authorizeUrl: (redirectUri, state) =>
      `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
      })}`,
    async profile(code, redirectUri) {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const tokens = await tokenRes.json();
      if (!tokenRes.ok || !tokens.access_token) throw new Error('Google token exchange failed');
      const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const info = await infoRes.json();
      if (!infoRes.ok || !info.sub) throw new Error('Could not read Google profile');
      return {
        id: String(info.sub),
        email: info.email_verified ? String(info.email || '').toLowerCase() : '',
        name: info.name || info.given_name || '',
      };
    },
  },
  facebook: {
    enabled: () => Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
    idColumn: 'facebook_id',
    authorizeUrl: (redirectUri, state) =>
      `https://www.facebook.com/${FB_VERSION}/dialog/oauth?${new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'email,public_profile',
        state,
      })}`,
    async profile(code, redirectUri) {
      const tokenRes = await fetch(
        `https://graph.facebook.com/${FB_VERSION}/oauth/access_token?${new URLSearchParams({
          client_id: process.env.FACEBOOK_APP_ID,
          client_secret: process.env.FACEBOOK_APP_SECRET,
          redirect_uri: redirectUri,
          code,
        })}`
      );
      const tokens = await tokenRes.json();
      if (!tokenRes.ok || !tokens.access_token) throw new Error('Facebook token exchange failed');
      const proof = crypto
        .createHmac('sha256', process.env.FACEBOOK_APP_SECRET)
        .update(tokens.access_token)
        .digest('hex');
      const meRes = await fetch(
        `https://graph.facebook.com/${FB_VERSION}/me?${new URLSearchParams({
          fields: 'id,name,email',
          access_token: tokens.access_token,
          appsecret_proof: proof,
        })}`
      );
      const me = await meRes.json();
      if (!meRes.ok || !me.id) throw new Error('Could not read Facebook profile');
      // Facebook only returns an email the user has confirmed.
      return { id: String(me.id), email: String(me.email || '').toLowerCase(), name: me.name || '' };
    },
  },
};

/** Public site origin the browser uses (the API is served same-origin under /api). */
function publicBase() {
  const explicit = String(process.env.OAUTH_REDIRECT_BASE || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return String(process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');
}

function redirectUriFor(provider) {
  return `${publicBase()}/api/auth/${provider}/callback`;
}

/** Only same-site storefront paths; never the admin portal or another origin. */
function safeNext(raw) {
  const next = String(raw || '');
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/admin')) return '/account';
  return next.slice(0, 200);
}

function stateCookieOpts() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: 10 * 60 * 1000,
  };
}

function fail(res, code) {
  return res.redirect(`${publicBase()}/login?error=${encodeURIComponent(code)}`);
}

router.get('/providers', (_req, res) =>
  res.json({
    success: true,
    data: { google: PROVIDERS.google.enabled(), facebook: PROVIDERS.facebook.enabled() },
  })
);

router.get('/:provider', (req, res, next) => {
  const p = PROVIDERS[req.params.provider];
  if (!p) return next();
  if (!p.enabled()) return fail(res, 'provider_unavailable');
  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(
    STATE_COOKIE,
    JSON.stringify({ state, provider: req.params.provider, next: safeNext(req.query.next) }),
    stateCookieOpts()
  );
  return res.redirect(p.authorizeUrl(redirectUriFor(req.params.provider), state));
});

async function findOrCreateUser(providerName, profile) {
  const { idColumn } = PROVIDERS[providerName];
  const byId = await query(`SELECT id, role FROM users WHERE ${idColumn} = $1`, [profile.id]);
  if (byId.rows[0]) return byId.rows[0];
  if (!profile.email) throw Object.assign(new Error('no email'), { code: 'email_required' });

  const byEmail = await query(`SELECT id, role FROM users WHERE lower(email) = $1`, [profile.email]);
  if (byEmail.rows[0]) {
    if (byEmail.rows[0].role !== 'customer') {
      throw Object.assign(new Error('portal account'), { code: 'portal_account' });
    }
    // Provider-verified email belongs to this account: link it for next time.
    await query(`UPDATE users SET ${idColumn} = $1 WHERE id = $2`, [profile.id, byEmail.rows[0].id]);
    return byEmail.rows[0];
  }

  const reservedAdmin = (process.env.ADMIN_EMAIL || 'admin@salembookhouse.com').toLowerCase();
  if (profile.email === reservedAdmin) throw Object.assign(new Error('reserved'), { code: 'portal_account' });

  // Random unusable password; the customer can set one later with "Forgot password".
  const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  const name = String(profile.name || profile.email.split('@')[0]).trim().slice(0, 120);
  const created = await query(
    `INSERT INTO users (name, email, password_hash, ${idColumn}) VALUES ($1,$2,$3,$4) RETURNING id, role`,
    [name, profile.email, hash, profile.id]
  );
  return created.rows[0];
}

router.get('/:provider/callback', async (req, res, next) => {
  const providerName = req.params.provider;
  const p = PROVIDERS[providerName];
  if (!p) return next();

  let saved = null;
  try {
    saved = JSON.parse(req.cookies?.[STATE_COOKIE] || 'null');
  } catch {
    saved = null;
  }
  res.clearCookie(STATE_COOKIE, { ...stateCookieOpts(), maxAge: undefined });

  if (req.query.error) return fail(res, 'cancelled');
  const state = String(req.query.state || '');
  if (
    !saved ||
    saved.provider !== providerName ||
    !state ||
    state.length !== saved.state.length ||
    !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(saved.state))
  ) {
    return fail(res, 'expired');
  }
  if (!p.enabled() || !req.query.code) return fail(res, 'provider_unavailable');

  try {
    const profile = await p.profile(String(req.query.code), redirectUriFor(providerName));
    const user = await findOrCreateUser(providerName, profile);
    // Admin portal accounts must sign in with their password.
    if (user.role !== 'customer') return fail(res, 'portal_account');
    setAuthCookie(res, signToken(user.id));
    return res.redirect(`${publicBase()}${safeNext(saved.next)}`);
  } catch (err) {
    if (err.code === 'email_required' || err.code === 'portal_account') return fail(res, err.code);
    console.error(`${providerName} sign-in failed:`, err.message || err);
    return fail(res, 'failed');
  }
});

export default router;
