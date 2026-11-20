import crypto from 'crypto';
import { query } from '../db/pool.js';
import { sendMail } from '../mailer.js';
import { renderEmail, siteBase } from '../notify/emailTemplate.js';

const EMAIL_COOLDOWN_MS = 60 * 60 * 1000; // one alert email per fingerprint per hour

/** Form / field / expected-input noise — never persist these. */
const LOGICAL_NOISE =
  /\b(this field is required|field is required|please (enter|choose|select|provide|fix)|must be|must match|too (short|long)|at least \d|at most \d|validation (failed|error)|form field|invalid (phone|mobile|email|pincode|pin code|password|otp|name|address|number|format|value|input)|enter a valid|password must|confirm password|otp|captcha|already (exists|taken|registered)|not available|out of stock|coupon (invalid|expired|not)|insufficient (stock|balance|funds))\b/i;

export function isLogicalNoise(message, statusCode) {
  if (statusCode != null && statusCode >= 400 && statusCode < 500) return true;
  const m = String(message || '').trim();
  if (!m) return true;
  if (LOGICAL_NOISE.test(m)) return true;
  if (
    m.length < 80 &&
    /^(please |this field|enter a |choose |select )/i.test(m) &&
    !/\b(TypeError|ReferenceError|SyntaxError|Internal server|ECONN|ETIMEDOUT|failed to fetch)\b/i.test(m)
  ) {
    return true;
  }
  return false;
}

/** Who gets live-site error alerts. Override with ERROR_ALERT_EMAILS (comma-separated). */
export function alertRecipients() {
  const raw = process.env.ERROR_ALERT_EMAILS || 'rokeshuvaraj17@gmail.com,sashkumarjay@gmail.com';
  return [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

function fingerprintOf({ source, message, path, stack }) {
  const top = String(stack || '')
    .split('\n')
    .slice(0, 4)
    .map((l) => l.trim())
    .join('|');
  const key = [source || 'server', String(message || '').slice(0, 240), path || '', top.slice(0, 400)].join('::');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 40);
}

function sanitize(input = {}) {
  const message = String(input.message || input.error || 'Unknown error').slice(0, 2000);
  const stack = input.stack != null ? String(input.stack).slice(0, 8000) : null;
  const path = input.path != null ? String(input.path).slice(0, 500) : null;
  const method = input.method != null ? String(input.method).slice(0, 16).toUpperCase() : null;
  const url = input.url != null ? String(input.url).slice(0, 1000) : null;
  const userAgent = input.userAgent != null ? String(input.userAgent).slice(0, 500) : null;
  const source = ['server', 'client', 'admin'].includes(input.source) ? input.source : 'server';
  const severity = input.severity === 'warning' ? 'warning' : 'error';
  const statusCode = Number.isFinite(Number(input.statusCode)) ? Number(input.statusCode) : null;
  let meta = {};
  if (input.meta && typeof input.meta === 'object' && !Array.isArray(input.meta)) {
    try {
      meta = JSON.parse(JSON.stringify(input.meta));
    } catch {
      meta = {};
    }
  }
  return { message, stack, path, method, url, userAgent, source, severity, statusCode, meta };
}

async function emailAlert(row) {
  const recipients = alertRecipients();
  if (!recipients.length) return;
  const base = siteBase();
  const dash = `${base}/admin/errors`;
  const content = {
    badge: 'Live site error',
    title: row.occurrences > 1 ? `Error again (${row.occurrences}×)` : 'New site error',
    preheader: String(row.message).slice(0, 120),
    greeting: 'Hi team,',
    paragraphs: [
      'An error was recorded on Salem Book House. Open the Errors dashboard to review and mark it resolved.',
      String(row.message).slice(0, 500),
    ],
    details: [
      { label: 'Source', value: row.source },
      { label: 'Severity', value: row.severity },
      { label: 'Occurrences', value: String(row.occurrences) },
      { label: 'Path', value: row.path || '—' },
      { label: 'Method', value: row.method || '—' },
      { label: 'Status', value: row.status_code != null ? String(row.status_code) : '—' },
      { label: 'URL', value: row.url || '—' },
      { label: 'Last seen', value: new Date(row.last_seen_at).toLocaleString('en-IN') },
      { label: 'Error ID', value: `#${row.id}` },
    ],
    cta: { label: 'Open Errors dashboard', url: dash },
    note: row.stack ? `Stack (first lines):\n${String(row.stack).split('\n').slice(0, 8).join('\n')}` : undefined,
  };
  const { html, text } = renderEmail(content);
  const subject = `[SBH error] ${String(row.message).slice(0, 80)}`;
  await Promise.allSettled(recipients.map((to) => sendMail({ to, subject, text, html })));
}

/**
 * Upsert an error by fingerprint. Emails alert recipients on first sight and again after the cooldown.
 * Never throws to the caller — logging must not break the request that failed.
 */
export async function recordError(raw) {
  try {
    const data = sanitize(raw);
    if (isLogicalNoise(data.message, data.statusCode)) return null;
    const fingerprint = fingerprintOf(data);
    const { rows } = await query(
      `INSERT INTO site_errors (
         fingerprint, source, severity, message, stack, path, method, status_code,
         user_agent, url, meta, occurrences, first_seen_at, last_seen_at, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,1,NOW(),NOW(),'open')
       ON CONFLICT (fingerprint) DO UPDATE SET
         occurrences = site_errors.occurrences + 1,
         last_seen_at = NOW(),
         message = EXCLUDED.message,
         stack = COALESCE(EXCLUDED.stack, site_errors.stack),
         path = COALESCE(EXCLUDED.path, site_errors.path),
         method = COALESCE(EXCLUDED.method, site_errors.method),
         status_code = COALESCE(EXCLUDED.status_code, site_errors.status_code),
         user_agent = COALESCE(EXCLUDED.user_agent, site_errors.user_agent),
         url = COALESCE(EXCLUDED.url, site_errors.url),
         meta = CASE WHEN EXCLUDED.meta = '{}'::jsonb THEN site_errors.meta ELSE EXCLUDED.meta END,
         status = CASE WHEN site_errors.status = 'ignored' THEN 'ignored' ELSE 'open' END,
         resolved_at = CASE WHEN site_errors.status = 'ignored' THEN site_errors.resolved_at ELSE NULL END,
         resolved_by = CASE WHEN site_errors.status = 'ignored' THEN site_errors.resolved_by ELSE NULL END
       RETURNING *`,
      [
        fingerprint,
        data.source,
        data.severity,
        data.message,
        data.stack,
        data.path,
        data.method,
        data.statusCode,
        data.userAgent,
        data.url,
        JSON.stringify(data.meta),
      ]
    );
    const row = rows[0];
    if (!row || row.status === 'ignored') return row;
    const due =
      !row.last_emailed_at ||
      Date.now() - new Date(row.last_emailed_at).getTime() >= EMAIL_COOLDOWN_MS;
    if (due) {
      emailAlert(row).catch((err) => console.warn('error alert email:', err.message));
      await query(`UPDATE site_errors SET last_emailed_at = NOW() WHERE id = $1`, [row.id]).catch(() => undefined);
    }
    return row;
  } catch (err) {
    console.warn('recordError failed:', err.message);
    return null;
  }
}

export async function openErrorCount() {
  try {
    const { rows } = await query(`SELECT COUNT(*)::int AS c FROM site_errors WHERE status = 'open'`);
    return rows[0]?.c || 0;
  } catch {
    return 0;
  }
}
