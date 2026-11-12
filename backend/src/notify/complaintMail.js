import { sendMail } from '../mailer.js';
import { renderEmail, siteBase } from './emailTemplate.js';

const STORE = 'Salem Book House';
const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';
const trackUrl = () => `${siteBase()}/complaint/track`;

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

export const complaintReceivedEmail = (c) =>
  deliver('complaint-received', c.email, `We received your complaint ${c.ticket}`, {
    badge: 'Support',
    title: 'We received your complaint',
    preheader: `Your ticket number is ${c.ticket}.`,
    greeting: `Hi ${first(c.name)},`,
    paragraphs: [
      'Thank you for telling us. Our team will look into it and reply on this ticket. Keep the ticket number below to check progress.',
    ],
    details: [
      { label: 'Ticket', value: c.ticket },
      { label: 'Subject', value: c.subject },
      ...(c.order_number ? [{ label: 'Order', value: c.order_number }] : []),
    ],
    cta: { label: 'Check my complaint', url: trackUrl() },
    note: 'You will need this ticket number and the email address you used.',
  });

export const complaintReplyEmail = (c, message, staffName) =>
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
    cta: { label: 'View and reply', url: trackUrl() },
  });

export const complaintResolvedEmail = (c) =>
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
    cta: { label: 'Not solved? Reply here', url: trackUrl() },
    note: `Replying on the ticket reopens it. Thank you for your patience with ${STORE}.`,
  });
