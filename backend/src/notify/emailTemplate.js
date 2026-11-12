/**
 * Branded HTML email layout for every message the store sends.
 * Table-based with inline styles so it renders in Gmail, Outlook and phone mail apps.
 * `renderEmail` returns { html, text }; the text part is the plain fallback.
 */

const NAVY = '#163a6b';
const NAVY_DARK = '#0f2a4d';
const GOLD = '#f5c518';
const INK = '#1f2937';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const BG = '#f3f4f6';

export const siteBase = () => String(process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Rupee amounts as HTML (entity keeps the symbol safe in any database or mail encoding). */
export const rupeesHtml = (n) => '&#8377;' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rupeesText = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STEPS = ['Placed', 'Confirmed', 'Shipped', 'Out for delivery', 'Delivered'];

function stepsBlock(current) {
  const cells = STEPS.map((label, i) => {
    const done = i <= current;
    return `<td align="center" valign="top" style="width:20%;padding:0 2px;">
      <div style="width:26px;height:26px;line-height:26px;border-radius:13px;margin:0 auto;font-size:13px;font-weight:700;background:${done ? NAVY : '#e5e7eb'};color:${done ? '#ffffff' : '#9ca3af'};">${done ? '&#10003;' : i + 1}</div>
      <div style="font-size:11px;line-height:14px;margin-top:6px;color:${done ? INK : '#9ca3af'};font-weight:${i === current ? '700' : '400'};">${esc(label)}</div>
    </td>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;"><tr>${cells}</tr></table>`;
}

function detailsBlock(rows) {
  const body = rows
    .filter((r) => r && r.value != null && r.value !== '')
    .map(
      (r) => `<tr>
        <td style="padding:8px 0;font-size:13px;color:${MUTED};border-bottom:1px solid ${LINE};">${esc(r.label)}</td>
        <td align="right" style="padding:8px 0;font-size:14px;color:${INK};font-weight:600;border-bottom:1px solid ${LINE};">${r.html ? r.value : esc(r.value)}</td>
      </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#f9fafb;border:1px solid ${LINE};border-radius:10px;"><tr><td style="padding:6px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table></td></tr></table>`;
}

function itemsBlock(items, totals) {
  const rows = items
    .map(
      (it) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};">${esc(it.title)}<div style="font-size:12px;color:${MUTED};margin-top:2px;">Qty ${esc(it.quantity)}</div></td>
        <td align="right" valign="top" style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};white-space:nowrap;">${rupeesHtml(it.lineTotal ?? Number(it.price) * Number(it.quantity))}</td>
      </tr>`
    )
    .join('');
  const tot = (totals || [])
    .map(
      (t) => `<tr>
        <td style="padding:5px 0;font-size:${t.strong ? 15 : 13}px;color:${t.strong ? INK : MUTED};font-weight:${t.strong ? 700 : 400};">${esc(t.label)}</td>
        <td align="right" style="padding:5px 0;font-size:${t.strong ? 16 : 13}px;color:${INK};font-weight:${t.strong ? 700 : 500};">${t.negative ? '&minus; ' : ''}${rupeesHtml(t.value)}</td>
      </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 4px;">${rows}</table>
  ${tot ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;">${tot}</table>` : ''}`;
}

function couponBlock(c) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td align="center" style="background:#fffbea;border:2px dashed ${GOLD};border-radius:12px;padding:20px 16px;">
    <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};font-weight:700;">${esc(c.eyebrow || 'Your welcome offer')}</div>
    <div style="font-size:20px;font-weight:800;color:${NAVY};margin:6px 0 2px;">${esc(c.headline)}</div>
    <div style="display:inline-block;margin:10px 0;padding:10px 22px;background:${NAVY};color:${GOLD};font-size:24px;letter-spacing:3px;font-weight:800;border-radius:8px;font-family:Consolas,Menlo,monospace;">${esc(c.code)}</div>
    ${c.detail ? `<div style="font-size:13px;color:${INK};">${esc(c.detail)}</div>` : ''}
    ${c.expires ? `<div style="font-size:12px;color:${MUTED};margin-top:4px;">${esc(c.expires)}</div>` : ''}
  </td></tr></table>`;
}

function button(cta) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 6px;"><tr><td align="center" style="background:${NAVY};border-radius:8px;">
    <a href="${esc(cta.url)}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:.3px;">${esc(cta.label)} &rarr;</a>
  </td></tr></table>`;
}

/**
 * @param {object} o
 * @param {string} o.title            Big heading
 * @param {string} [o.preheader]      Inbox preview text
 * @param {string} [o.badge]          Small pill above the heading, e.g. "Order confirmed"
 * @param {string} [o.greeting]       "Hi Ravi,"
 * @param {string[]} [o.paragraphs]   Body paragraphs (plain text)
 * @param {{label:string,value:string,html?:boolean}[]} [o.details]
 * @param {{title:string,quantity:number,price?:number,lineTotal?:number}[]} [o.items]
 * @param {{label:string,value:number,strong?:boolean,negative?:boolean}[]} [o.totals]
 * @param {{code:string,headline:string,detail?:string,expires?:string,eyebrow?:string}} [o.coupon]
 * @param {number} [o.step]           0-4 position on the order tracker (omit to hide)
 * @param {{label:string,url:string}} [o.cta]
 * @param {string} [o.note]           Small print under the button
 * @param {string} [o.unsubscribeUrl] Marketing mail only: adds the unsubscribe line
 */
export function renderEmail(o) {
  const base = siteBase();
  const paragraphs = (o.paragraphs || []).map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:24px;color:${INK};">${esc(p)}</p>`).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:${BG};-webkit-text-size-adjust:100%;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(o.preheader || o.title)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(15,42,77,.08);">
    <tr><td style="background:${NAVY};padding:18px 24px;border-bottom:4px solid ${GOLD};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="52" valign="middle"><img src="${esc(base)}/sbh-logo.jpg" width="48" height="48" alt="" style="display:block;border-radius:8px;border:0;"></td>
        <td valign="middle" style="padding-left:12px;"><div style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:.3px;">Salem Book House</div><div style="font-size:12px;color:${GOLD};margin-top:2px;">Salem's Favourite Book Mall</div></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:28px 28px 8px;">
      ${o.badge ? `<div style="display:inline-block;background:#e8f0fb;color:${NAVY};font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;padding:5px 12px;border-radius:999px;margin-bottom:12px;">${esc(o.badge)}</div>` : ''}
      <h1 style="margin:0 0 14px;font-size:26px;line-height:32px;color:${NAVY_DARK};font-weight:800;">${esc(o.title)}</h1>
      ${o.greeting ? `<p style="margin:0 0 12px;font-size:15px;line-height:24px;color:${INK};font-weight:600;">${esc(o.greeting)}</p>` : ''}
      ${paragraphs}
      ${typeof o.step === 'number' ? stepsBlock(o.step) : ''}
      ${o.details?.length ? detailsBlock(o.details) : ''}
      ${o.items?.length ? itemsBlock(o.items, o.totals) : ''}
      ${o.coupon ? couponBlock(o.coupon) : ''}
      ${o.cta ? button(o.cta) : ''}
      ${o.note ? `<p style="margin:14px 0 0;font-size:12px;line-height:18px;color:${MUTED};text-align:center;">${esc(o.note)}</p>` : ''}
    </td></tr>
    <tr><td style="padding:20px 28px 26px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};"><tr><td align="center" style="padding-top:18px;">
        <div style="font-size:13px;color:${INK};font-weight:700;">Need help?</div>
        <div style="font-size:12px;line-height:19px;color:${MUTED};margin-top:4px;">Reply to your order from your account, or visit <a href="${esc(base)}/contact" style="color:${NAVY};text-decoration:underline;">Contact us</a>.</div>
        <div style="font-size:12px;margin-top:12px;"><a href="${esc(base)}/shop/books" style="color:${NAVY};text-decoration:none;font-weight:600;">Shop</a> &nbsp;&middot;&nbsp; <a href="${esc(base)}/account/orders" style="color:${NAVY};text-decoration:none;font-weight:600;">My orders</a> &nbsp;&middot;&nbsp; <a href="${esc(base)}/track" style="color:${NAVY};text-decoration:none;font-weight:600;">Track order</a></div>
        <div style="font-size:11px;line-height:17px;color:#9ca3af;margin-top:14px;">Salem Book House, Salem, Tamil Nadu, India<br>${o.unsubscribeUrl ? `You are receiving this offer because you chose to hear from us. <a href="${esc(o.unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a> at any time.` : `This is an automated message about your activity on ${esc(base.replace(/^https?:\/\//, ''))}.`}</div>
      </td></tr></table>
    </td></tr>
  </table>
</td></tr></table></body></html>`;

  // Any remaining non-ASCII (book titles, names) becomes numeric entities so it survives every mail path.
  const safeHtml = html.replace(/[^\x00-\x7F]/g, (c) => `&#${c.codePointAt(0)};`);

  const lines = [o.title, ''];
  if (o.greeting) lines.push(o.greeting, '');
  for (const p of o.paragraphs || []) lines.push(p, '');
  if (typeof o.step === 'number') lines.push(`Status: ${STEPS[o.step]}`, '');
  for (const r of o.details || []) if (r && r.value != null && r.value !== '') lines.push(`${r.label}: ${r.html ? String(r.value).replace(/<[^>]+>/g, '').replace(/&#8377;/g, 'Rs. ') : r.value}`);
  if (o.details?.length) lines.push('');
  for (const it of o.items || []) lines.push(`- ${it.title} x ${it.quantity}  ${rupeesText(it.lineTotal ?? Number(it.price) * Number(it.quantity))}`);
  for (const t of o.totals || []) lines.push(`${t.label}: ${t.negative ? '-' : ''}${rupeesText(t.value)}`);
  if (o.items?.length) lines.push('');
  if (o.coupon) lines.push(`${o.coupon.headline}`, `Use code: ${o.coupon.code}`, o.coupon.detail || '', o.coupon.expires || '', '');
  if (o.cta) lines.push(`${o.cta.label}: ${o.cta.url}`, '');
  if (o.note) lines.push(o.note, '');
  if (o.unsubscribeUrl) lines.push(`Unsubscribe: ${o.unsubscribeUrl}`, '');
  lines.push('Salem Book House', base);
  return { html: safeHtml, text: lines.join('\n').replace(/\n{3,}/g, '\n\n') };
}
