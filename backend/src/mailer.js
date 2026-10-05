import nodemailer from 'nodemailer';
import { query } from './db/pool.js';

function smtpReady() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function mailConfigured() {
  return smtpReady();
}

export async function sendMail({ to, subject, text, html }) {
  const body = html || text || '';
  const { rows } = await query(
    `INSERT INTO email_outbox (to_email, subject, body, sent) VALUES ($1,$2,$3,FALSE) RETURNING id`,
    [to, subject, text || body.replace(/<[^>]+>/g, ' ')]
  );
  const id = rows[0].id;
  if (!smtpReady()) {
    console.log(`[mail:outbox] to=${to} subject=${subject}`);
    return { queued: true, sent: false, id };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || '') === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    await query(`UPDATE email_outbox SET sent = TRUE WHERE id = $1`, [id]);
    return { queued: true, sent: true, id };
  } catch (err) {
    await query(`UPDATE email_outbox SET error = $2 WHERE id = $1`, [id, String(err.message || err)]);
    console.error('SMTP send failed:', err.message || err);
    return { queued: true, sent: false, id, error: err.message };
  }
}
