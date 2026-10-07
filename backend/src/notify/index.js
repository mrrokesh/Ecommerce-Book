import { sendMail } from '../mailer.js';

async function smsSend(to, message) {
  const key = process.env.MSG91_AUTH_KEY;
  const sender = process.env.MSG91_SENDER || 'SBHOM';
  if (!key || !to) return { sent: false, reason: 'MSG91 not configured' };
  const mobile = String(to).replace(/\D/g, '').slice(-10);
  try {
    const url = `https://api.msg91.com/api/sendhttp.php?authkey=${encodeURIComponent(key)}&mobiles=91${mobile}&message=${encodeURIComponent(message)}&sender=${encodeURIComponent(sender)}&route=4&country=91`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    return { sent: res.ok, channel: 'sms', status: res.status };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

export async function notifyOrderEvent({ order, event, note }) {
  const email = order.guestEmail || order.guest_email || order.email || null;
  const phone = order.shippingPhone || order.shipping_phone || order.phone || null;
  const orderNumber = order.orderNumber || order.order_number;
  const trackingUrl = order.trackingUrl || order.tracking_url;
  const awb = order.awb;
  const lines = [
    `Salem Book House — ${event}`,
    `Order ${orderNumber}`,
    note || '',
    trackingUrl ? `Track: ${trackingUrl}` : '',
    awb ? `AWB: ${awb}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (email) {
    try {
      await sendMail({
        to: email,
        subject: `Order ${orderNumber}: ${event}`,
        text: lines,
      });
    } catch (err) {
      console.warn('notify email:', err.message);
    }
  }
  if (phone) {
    const sms = await smsSend(phone, lines.replace(/\n/g, ' ').slice(0, 160));
    if (!sms.sent) console.warn('notify sms:', sms.reason || sms);
  }
}
