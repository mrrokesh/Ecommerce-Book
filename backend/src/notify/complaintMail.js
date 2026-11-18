import { sendMail } from '../mailer.js';
import { renderEmail } from './emailTemplate.js';

const STORE = 'Salem Book House';
const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

/** Best-effort: a mail failure must never break raising or answering a complaint. */
async function deliver(label, to, subject, content) {
  if (!to) return;
  try {
    const { html, text } = renderEmail(content);
    await sendMail({ to, subject, text, html });
  } catch (err) {
    console.warn(`${label} email:`, err.message);
  }
}

/**
 * `link` is where the customer opens the ticket: a signed-in customer's own page, or for guests a
 * personal link with a time-limited token (the ticket number alone never grants access).
 */
export const complaintReceivedEmail = (c, link) =>
  deliver('complaint-received', c.email, `We received your complaint ${c.ticket}`, {
    badge: 'Support',
    title: 'We received your complaint',
    preheader: `Your ticket number is ${c.ticket}.`,
    greeting: `Hi ${first(c.name)},`,
    paragraphs: [
      'Thank you for telling us. Our team will look into it and reply on this ticket. Use the button below to follow it.',
    ],
    details: [
      { label: 'Ticket', value: c.ticket },
      { label: 'Subject', value: c.subject },
      ...(c.order_number ? [{ label: 'Order', value: c.order_number }] : []),
    ],
    cta: { label: 'Open my complaint', url: link },
    note: c.user_id ? 'Sign in to your account to view it.' : 'This personal link works for a limited time. Do not forward this email.',
  });

export const complaintReplyEmail = (c, message, staffName, link) =>
  deliver('complaint-reply', c.email, `Update on your complaint ${c.ticket}`, {
    badge: 'Support',
    title: 'We replied to your complaint',
    preheader: `New reply on ticket ${c.ticket}.`,
    greeting: `Hi ${first(c.name)},`,
    paragraphs: [`${staffName ? staffName + ' from our team' : 'Our team'} wrote:`, message],
    details: [
      { label: 'Ticket', value: c.ticket },
      { label: 'Subject', value: c.subject },
    ],
    cta: { label: 'View and reply', url: link },
    note: c.user_id ? 'Sign in to your account to reply.' : 'This personal link works for a limited time. Do not forward this email.',
  });

export const complaintResolvedEmail = (c, link) =>
  deliver('complaint-resolved', c.email, `Your complaint ${c.ticket} is resolved`, {
    badge: 'Resolved',
    title: 'Your complaint was resolved',
    preheader: `Ticket ${c.ticket} is marked resolved.`,
    greeting: `Hi ${first(c.name)},`,
    paragraphs: ['Our team marked your complaint as resolved.', c.resolution || ''].filter(Boolean),
    details: [
      { label: 'Ticket', value: c.ticket },
      { label: 'Subject', value: c.subject },
    ],
    cta: { label: 'Not solved? Reply here', url: link },
    note: `Replying on the ticket reopens it. Thank you for your patience with ${STORE}.`,
  });

/** Sent when a guest asks for a fresh link; it only ever goes to the email address on the ticket. */
export const complaintAccessEmail = (c, link, hours) =>
  deliver('complaint-access', c.email, `Your link to complaint ${c.ticket}`, {
    badge: 'Support',
    title: 'Your secure link',
    preheader: `Open complaint ${c.ticket}.`,
    greeting: `Hi ${first(c.name)},`,
    paragraphs: [`Someone asked to open complaint ${c.ticket}. If that was you, use the button below. The link works for ${hours} hours.`],
    cta: { label: 'Open my complaint', url: link },
    note: 'If you did not ask for this, ignore this email. Nobody can see your complaint without it.',
  });
