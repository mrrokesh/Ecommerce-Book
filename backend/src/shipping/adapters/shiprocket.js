const BASE = 'https://apiv2.shiprocket.in/v1/external';

async function getToken(creds) {
  if (creds.token && creds.tokenExpiresAt && Date.now() < Number(creds.tokenExpiresAt)) {
    return creds.token;
  }
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) {
    throw new Error(body.message || `Shiprocket auth failed (${res.status})`);
  }
  return body.token;
}

export async function createShipment(order, creds) {
  if (!creds?.email || !creds?.password) {
    throw new Error('Shiprocket email and password are required in Shipping settings');
  }
  const token = await getToken(creds);
  const pin = String(order.shippingAddress || '').match(/\b(\d{6})\b/)?.[1] || '636001';
  const items = (order.items || []).map((it) => ({
    name: it.title,
    sku: String(it.bookId || it.id || 'SKU'),
    units: it.quantity,
    selling_price: Number(it.unitPrice || it.unit_price || 0),
  }));
  const payload = {
    order_id: order.orderNumber,
    order_date: new Date(order.createdAt || Date.now()).toISOString().slice(0, 19).replace('T', ' '),
    pickup_location: creds.pickupLocation || 'Primary',
    billing_customer_name: order.shippingName,
    billing_last_name: '',
    billing_address: order.shippingAddress,
    billing_city: order.city || 'Salem',
    billing_pincode: pin,
    billing_state: order.state || 'Tamil Nadu',
    billing_country: 'India',
    billing_email: order.guestEmail || order.email || 'orders@salembookhouse.com',
    billing_phone: String(order.shippingPhone || '').replace(/\D/g, '').slice(-10),
    shipping_is_billing: true,
    order_items: items.length
      ? items
      : [{ name: 'Books', sku: 'SBH', units: 1, selling_price: Number(order.total || 0) }],
    payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
    sub_total: Number(order.subtotal || order.total || 0),
    length: 20,
    breadth: 15,
    height: 5,
    weight: Math.max(0.5, (items.reduce((s, i) => s + i.units, 0) || 1) * 0.4),
  };
  if (creds.channelId) payload.channel_id = creds.channelId;

  const res = await fetch(`${BASE}/orders/create/adhoc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || JSON.stringify(body).slice(0, 200) || `Shiprocket HTTP ${res.status}`);
  }
  const awb = body.awb_code || body.awb || null;
  const shipmentId = String(body.shipment_id || body.order_id || '');
  return {
    ok: true,
    carrier: 'shiprocket',
    awb,
    shipmentId,
    trackingUrl: awb ? `https://shiprocket.co/tracking/${awb}` : null,
    raw: body,
  };
}

export async function trackShipment(awb, creds) {
  const token = await getToken(creds);
  const res = await fetch(`${BASE}/courier/track/awb/${encodeURIComponent(awb)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(45_000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: body.tracking_data?.shipment_status || 'unknown', raw: body };
}

export async function checkServiceability(pincode, creds) {
  if (!creds?.email || !creds?.password) return { serviceable: true, etaDays: 4 };
  try {
    const token = await getToken(creds);
    const pickup = creds.pickupPincode || '636001';
    const url = `${BASE}/courier/serviceability/?pickup_postcode=${pickup}&delivery_postcode=${pincode}&cod=1&weight=0.5`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json().catch(() => ({}));
    const available = Boolean(body.data?.available_courier_companies?.length);
    return { serviceable: available || res.ok, etaDays: available ? 3 : 5, raw: body };
  } catch {
    return { serviceable: true, etaDays: 4 };
  }
}
