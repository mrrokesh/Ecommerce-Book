import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query, getPool } from '../db/pool.js';
import { requirePermission } from '../middleware/auth.js';
import { sendMail } from '../mailer.js';
import { renderEmail, siteBase } from '../notify/emailTemplate.js';
import { couponOffer } from '../notify/accountMail.js';
import { safeLink } from '../utils/safeLink.js';
import { checks } from '../utils/validate.js';

/**
 * Promotional email campaigns (seasonal sales, coupon announcements).
 * Only customers who ticked the marketing opt-in box receive them, every message carries an
 * unsubscribe link, and sends are queued through the email outbox so they are rate limited and retried.
 */
const router = Router();
router.use(requirePermission('marketing'));

const DAILY_CAP = Number(process.env.MAIL_DAILY_CAP || 1500); // Rokesh Notify Pro allows 2000 a day
const testLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const wrap = (fn) => async (req, res) => {
  try {
    res.json({ success: true, data: await fn(req, res) });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, error: e.message });
  }
};
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function clean(body) {
  const f = {
    name: String(body.name || '').trim(),
    subject: String(body.subject || '').trim(),
    preheader: String(body.preheader || '').trim(),
    headline: String(body.headline || '').trim(),
    body: String(body.body || '').trim(),
    couponCode: String(body.couponCode || '').trim().toUpperCase(),
    ctaLabel: String(body.ctaLabel || 'Shop the sale').trim(),
    ctaUrl: String(body.ctaUrl || '/shop/books').trim(),
  };
  if (f.name.length < 2 || f.name.length > 80) throw fail('Give the campaign a name (2 to 80 characters)');
  if (f.subject.length < 5 || f.subject.length > 120) throw fail('Subject must be 5 to 120 characters (30 to 60 reads best on phones)');
  if (f.preheader.length > 140) throw fail('Preview text must be at most 140 characters');
  if (f.headline.length < 3 || f.headline.length > 100) throw fail('Headline must be 3 to 100 characters');
  if (f.body.length < 10 || f.body.length > 5000) throw fail('Message must be 10 to 5000 characters');
  if (f.ctaLabel.length < 2 || f.ctaLabel.length > 40) throw fail('Button text must be 2 to 40 characters');
  const link = safeLink(f.ctaUrl);
  if (!link) throw fail('Button link must be a site path like /shop/books or a full https:// address');
  f.ctaUrl = link;
  return f;
}

const absolute = (url) => (url.startsWith('/') ? siteBase() + url : url);

async function build(c, { firstName = 'there', unsubscribeUrl } = {}) {
  const coupon = c.coupon_code ? await couponOffer(c.coupon_code) : null;
  return renderEmail({
    badge: 'Special offer',
    title: c.headline,
    preheader: c.preheader || c.subject,
    greeting: `Hi ${firstName},`,
    paragraphs: String(c.body).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    coupon: coupon || undefined,
    cta: { label: c.cta_label, url: absolute(c.cta_url) },
    unsubscribeUrl,
  });
}


/**
 * Everyone who may receive promotions: customers who ticked the opt-in box plus subscribers added by an admin,
 * one row per email address, minus anyone who unsubscribed.
 */
const AUDIENCE_SQL = `
  SELECT d.email, d.name, d.token FROM (
    SELECT DISTINCT ON (lower(a.email)) a.email, a.name, a.token FROM (
      SELECT u.email, u.name, u.unsubscribe_token AS token, 1 AS pri FROM users u
       WHERE u.role = 'customer' AND u.marketing_opt_in = TRUE AND u.email IS NOT NULL AND u.email_verified_at IS NOT NULL
      UNION ALL
      SELECT s.email, s.name, s.unsubscribe_token AS token, 2 AS pri FROM marketing_subscribers s WHERE s.active = TRUE
    ) a ORDER BY lower(a.email), a.pri
  ) d
  WHERE NOT EXISTS (SELECT 1 FROM marketing_subscribers x WHERE lower(x.email) = lower(d.email) AND x.active = FALSE)`;

/** Give every audience member a stable unsubscribe token. */
async function ensureTokens(client) {
  await client.query(`UPDATE users SET unsubscribe_token = md5(random()::text || clock_timestamp()::text || id::text) WHERE unsubscribe_token IS NULL AND marketing_opt_in = TRUE`);
  await client.query(`UPDATE marketing_subscribers SET unsubscribe_token = md5(random()::text || clock_timestamp()::text || id::text) WHERE unsubscribe_token IS NULL`);
}

const getCampaign = async (id) => {
  const c = (await query('SELECT * FROM campaigns WHERE id = $1', [Number(id)])).rows[0];
  if (!c) throw fail('Campaign not found', 404);
  return c;
};

router.get('/', wrap(async () => {
  const rows = (await query(
    `SELECT c.*, COALESCE(s.total,0)::int AS queued, COALESCE(s.sent,0)::int AS delivered, COALESCE(s.failed,0)::int AS failed
       FROM campaigns c
       LEFT JOIN (SELECT campaign_id, COUNT(*) AS total, COUNT(*) FILTER (WHERE sent) AS sent,
                         COUNT(*) FILTER (WHERE NOT sent AND attempts >= 5) AS failed
                    FROM email_outbox WHERE campaign_id IS NOT NULL GROUP BY campaign_id) s ON s.campaign_id = c.id
      ORDER BY c.created_at DESC LIMIT 100`)).rows;
  const subscribers = (await query(`SELECT COUNT(*)::int AS n FROM (${AUDIENCE_SQL}) q`)).rows[0].n;
  const coupons = (await query(`SELECT code, description FROM coupons WHERE active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY code`)).rows;
  const sentToday = (await query(`SELECT COUNT(*)::int AS n FROM email_outbox WHERE sent AND created_at > NOW() - INTERVAL '1 day'`)).rows[0].n;
  return { campaigns: rows, subscribers, coupons, dailyCap: DAILY_CAP, sentToday };
}));

/* ---------- subscriber list ---------- */
router.get('/subscribers', wrap(async () => {
  const rows = (await query(`
    SELECT 'account' AS source, u.id::text AS ref, u.email, u.name, COALESCE(u.marketing_consent_at, u.created_at) AS consent_at, TRUE AS active
      FROM users u WHERE u.role = 'customer' AND u.marketing_opt_in = TRUE AND u.email_verified_at IS NOT NULL
    UNION ALL
    SELECT s.source, s.id::text, s.email, s.name, s.consent_at, s.active FROM marketing_subscribers s
    ORDER BY consent_at DESC LIMIT 2000`)).rows;
  const unsubscribed = rows.filter((r) => !r.active).length;
  return { subscribers: rows, active: rows.length - unsubscribed, unsubscribed };
}));

router.post('/subscribers', wrap(async (req) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  if (checks.email(email)) throw fail('Enter a valid email address');
  if (name && checks.name(name)) throw fail('Enter a valid name (letters only) or leave it blank');
  if (req.body?.consent !== true) throw fail('Confirm that this person agreed to receive offers by email');
  const existing = (await query('SELECT id, active FROM marketing_subscribers WHERE lower(email) = $1', [email])).rows[0];
  if (existing && !existing.active) throw fail('This person unsubscribed. They can opt in again from their own account, or by signing up again');
  if (existing) return { id: existing.id, already: true };
  const { rows } = await query(
    `INSERT INTO marketing_subscribers (email, name, source, consent_note, unsubscribe_token, created_by)
     VALUES ($1, $2, 'admin', $3, md5(random()::text || clock_timestamp()::text || $1), $4) RETURNING id`,
    [email, name || null, String(req.body?.note || 'Added by an admin who confirmed consent').slice(0, 200), req.user.id]);
  return { id: rows[0].id, already: false };
}));

router.delete('/subscribers/:id', wrap(async (req) => {
  const id = String(req.params.id);
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    await query(`UPDATE users SET marketing_opt_in = FALSE WHERE id = $1 AND role = 'customer'`, [id]);
  } else {
    await query('UPDATE marketing_subscribers SET active = FALSE, unsubscribed_at = NOW() WHERE id = $1', [Number(id) || 0]);
  }
  return { removed: true };
}));

router.post('/', wrap(async (req) => {
  const f = clean(req.body || {});
  if (f.couponCode && !(await couponOffer(f.couponCode))) throw fail('That coupon is not active. Pick an active coupon or none');
  if (req.body.id) {
    const existing = await getCampaign(req.body.id);
    if (existing.status !== 'draft') throw fail('Only drafts can be edited');
    const { rows } = await query(
      `UPDATE campaigns SET name=$2, subject=$3, preheader=$4, headline=$5, body=$6, coupon_code=$7, cta_label=$8, cta_url=$9 WHERE id=$1 RETURNING *`,
      [existing.id, f.name, f.subject, f.preheader || null, f.headline, f.body, f.couponCode || null, f.ctaLabel, f.ctaUrl]);
    return rows[0];
  }
  const { rows } = await query(
    `INSERT INTO campaigns (name, subject, preheader, headline, body, coupon_code, cta_label, cta_url, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [f.name, f.subject, f.preheader || null, f.headline, f.body, f.couponCode || null, f.ctaLabel, f.ctaUrl, req.user.id]);
  return rows[0];
}));

router.post('/:id/preview', wrap(async (req) => {
  const c = await getCampaign(req.params.id);
  return { html: (await build(c, { firstName: 'Ravi', unsubscribeUrl: siteBase() + '/unsubscribe?token=preview' })).html };
}));

router.post('/:id/test', testLimiter, wrap(async (req) => {
  const c = await getCampaign(req.params.id);
  const to = String(req.body?.to || req.user.email || '').trim();
  if (checks.email(to)) throw fail('Enter a valid email address for the test');
  const { html, text } = await build(c, { firstName: String(req.user.name || 'there').split(/\s+/)[0], unsubscribeUrl: siteBase() + '/unsubscribe?token=test' });
  const r = await sendMail({ to, subject: `[TEST] ${c.subject}`, text, html });
  if (!r.sent) throw fail(r.error || 'The test email could not be sent. Check the email provider settings');
  return { sent: true, to };
}));

router.post('/:id/send', wrap(async (req) => {
  if (req.body?.confirm !== true) throw fail('Confirm the send');
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const c = (await client.query('SELECT * FROM campaigns WHERE id = $1 FOR UPDATE', [Number(req.params.id)])).rows[0];
    if (!c) throw fail('Campaign not found', 404);
    if (c.status !== 'draft') throw fail('This campaign was already sent');
    await ensureTokens(client);
    let people = (await client.query(AUDIENCE_SQL)).rows;
    if (Array.isArray(req.body?.emails)) {
      // Send to a chosen subset; anything that is not on the subscribed list is ignored.
      const wanted = new Set(req.body.emails.map((e) => String(e).trim().toLowerCase()));
      people = people.filter((p) => wanted.has(String(p.email).toLowerCase()));
      if (!people.length) throw fail('None of the chosen people are currently subscribed');
    }
    if (!people.length) throw fail('Nobody has opted in to offers yet');
    const sent = (await client.query(`SELECT COUNT(*)::int AS n FROM email_outbox WHERE created_at > NOW() - INTERVAL '1 day'`)).rows[0].n;
    if (sent + people.length > DAILY_CAP) throw fail(`This would exceed the daily email limit (${DAILY_CAP}). ${Math.max(0, DAILY_CAP - sent)} more can be sent in the next 24 hours`);
    let i = 0;
    for (const p of people) {
      const { html, text } = await build(c, { firstName: String(p.name || 'there').split(/\s+/)[0], unsubscribeUrl: `${siteBase()}/unsubscribe?token=${p.token}` });
      // Stagger delivery (about 150 a minute) so the provider's rate limit is respected
      await client.query(
        `INSERT INTO email_outbox (to_email, subject, body, html_body, campaign_id, next_attempt_at) VALUES ($1,$2,$3,$4,$5, NOW() + ($6 || ' seconds')::interval)`,
        [p.email, c.subject, text, html, c.id, String(Math.floor(i / 150) * 60)]);
      i += 1;
    }
    await client.query(`UPDATE campaigns SET status = 'sent', recipients = $2, sent_at = NOW() WHERE id = $1`, [c.id, people.length]);
    await client.query('COMMIT');
    return { queued: people.length };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}));

router.delete('/:id', wrap(async (req) => {
  const c = await getCampaign(req.params.id);
  if (c.status !== 'draft') throw fail('Only drafts can be deleted');
  await query('DELETE FROM campaigns WHERE id = $1', [c.id]);
  return { deleted: true };
}));

export default router;
