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
  const subscribers = (await query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'customer' AND marketing_opt_in = TRUE`)).rows[0].n;
  const coupons = (await query(`SELECT code, description FROM coupons WHERE active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY code`)).rows;
  const sentToday = (await query(`SELECT COUNT(*)::int AS n FROM email_outbox WHERE sent AND created_at > NOW() - INTERVAL '1 day'`)).rows[0].n;
  return { campaigns: rows, subscribers, coupons, dailyCap: DAILY_CAP, sentToday };
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
    // Give every subscriber a stable unsubscribe token
    await client.query(`UPDATE users SET unsubscribe_token = md5(random()::text || clock_timestamp()::text || id::text) WHERE unsubscribe_token IS NULL AND marketing_opt_in = TRUE`);
    const people = (await client.query(
      `SELECT name, email, unsubscribe_token FROM users WHERE role = 'customer' AND marketing_opt_in = TRUE AND email IS NOT NULL ORDER BY created_at`)).rows;
    if (!people.length) throw fail('No customers have opted in to offers yet');
    const sent = (await client.query(`SELECT COUNT(*)::int AS n FROM email_outbox WHERE created_at > NOW() - INTERVAL '1 day'`)).rows[0].n;
    if (sent + people.length > DAILY_CAP) throw fail(`This would exceed the daily email limit (${DAILY_CAP}). ${Math.max(0, DAILY_CAP - sent)} more can be sent in the next 24 hours`);
    let i = 0;
    for (const p of people) {
      const { html, text } = await build(c, { firstName: String(p.name || 'there').split(/\s+/)[0], unsubscribeUrl: `${siteBase()}/unsubscribe?token=${p.unsubscribe_token}` });
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
