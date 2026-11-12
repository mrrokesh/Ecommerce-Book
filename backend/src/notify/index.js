import { sendMail } from '../mailer.js';
import { renderEmail, siteBase } from './emailTemplate.js';

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

const TRACKER = { placed: 0, confirmed: 1, packed: 1, shipped: 2, 'shipment update': 2, 'out for delivery': 3, delivered: 4 };
const OUT = ['Out for delivery', 'Your order is out for delivery', 'Our courier is on the way. Please keep your phone handy.'];
const HEADLINES = {
  confirmed: ['Order confirmed', 'Your order is confirmed', 'We have confirmed your order and are preparing it.'],
  packed: ['Packed', 'Your order is packed', 'Your books are packed and will be handed to the courier soon.'],
  shipped: ['On its way', 'Your order has shipped', 'Good news! Your order is on its way to you.'],
  'shipment update': ['Shipment update', 'There is an update on your shipment', 'Here is the latest on your delivery.'],
  'out for delivery': OUT,
  delivered: ['Delivered', 'Your order was delivered', 'Your order has been delivered. We hope you enjoy your books!'],
  cancelled: ['Cancelled', 'Your order was cancelled', 'Your order has been cancelled. If you paid online, the refund is on its way.'],
  returned: ['Returned', 'Your return is complete', 'We have received your return.'],
  'return requested': ['Return requested', 'We received your return request', 'We will review it and email you the next step.'],
  'return approved': ['Return approved', 'Your return was approved', 'We will arrange the pickup shortly.'],
};

export async function notifyOrderEvent({ order, event, note }) {
  const email = order.guestEmail || order.guest_email || order.email || null;
  const phone = order.shippingPhone || order.shipping_phone || order.phone || null;
  const orderNumber = order.orderNumber || order.order_number;
  const trackingUrl = order.trackingUrl || order.tracking_url;
  const awb = order.awb;
  const key = String(event || '').toLowerCase().replace(/_/g, ' ').trim();
  const lookup = HEADLINES[key] || [String(event || 'Order update'), `Order update: ${event}`, ''];
  const cleanNote = note && String(note).toLowerCase().replace(/_/g, ' ').trim() !== key ? String(note) : '';
  const lines = [`Salem Book House - ${event}`, `Order ${orderNumber}`, cleanNote, trackingUrl ? `Track: ${trackingUrl}` : '', awb ? `AWB: ${awb}` : '']
    .filter(Boolean)
    .join('\n');

  if (email) {
    try {
      const base = siteBase();
      const step = TRACKER[key];
      const mine = order.userId || order.user_id;
      const { html, text } = renderEmail({
        badge: lookup[0],
        title: lookup[1],
        preheader: `${lookup[1]} - order ${orderNumber}`,
        greeting: `Hi ${String(order.shippingName || order.shipping_name || '').trim().split(/\s+/)[0] || 'there'},`,
        paragraphs: [lookup[2], ...(cleanNote ? [`Note: ${cleanNote}`] : [])].filter(Boolean),
        step: typeof step === 'number' ? step : undefined,
        details: [
          { label: 'Order number', value: orderNumber },
          { label: 'Courier', value: order.courier || '' },
          { label: 'Tracking number (AWB)', value: awb || '' },
        ],
        cta:
          trackingUrl && /^https?:\/\//i.test(trackingUrl)
            ? { label: 'Track my shipment', url: trackingUrl }
            : { label: 'View my order', url: mine ? `${base}/account/orders` : `${base}/track` },
      });
      await sendMail({ to: email, subject: `Order ${orderNumber}: ${lookup[0]}`, text, html });
    } catch (err) {
      console.warn('notify email:', err.message);
    }
  }
  if (phone) {
    const sms = await smsSend(phone, lines.replace(/\n/g, ' ').slice(0, 160));
    if (!sms.sent) console.warn('notify sms:', sms.reason || sms);
  }
}
