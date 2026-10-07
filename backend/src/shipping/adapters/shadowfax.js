const BASE = 'https://dale.shadowfax.in';

export async function createShipment(order, creds) {
  if (!creds?.token) throw new Error('Shadowfax API token is required in Shipping settings');
  const pin = String(order.shippingAddress || '').match(/\b(\d{6})\b/)?.[1] || '636001';
  const payload = {
    order_details: {
      client_order_id: order.orderNumber,
      actual_weight: 0.5,
      product_value: Number(order.total || 0),
      payment_mode: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
      cod_amount: order.paymentMethod === 'cod' ? Number(order.total || 0) : 0,
    },
    customer_details: {
      name: order.shippingName,
      contact: String(order.shippingPhone || '').replace(/\D/g, '').slice(-10),
      address_line_1: order.shippingAddress,
      city: order.city || 'Salem',
      state: order.state || 'Tamil Nadu',
      pincode: pin,
    },
    pickup_details: {
      client_code: creds.clientCode || undefined,
    },
  };
  const res = await fetch(`${BASE}/api/v3/clients/orders/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${creds.token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || body.error || `Shadowfax HTTP ${res.status}`);
  }
  const awb = body.awb_number || body.data?.awb_number || null;
  return {
    ok: true,
    carrier: 'shadowfax',
    awb,
    shipmentId: String(body.order_id || body.data?.order_id || order.orderNumber),
    trackingUrl: awb ? `https://shadowfax.in/track/${awb}` : null,
    raw: body,
  };
}

export async function trackShipment(awb, creds) {
  const res = await fetch(`${BASE}/api/v3/clients/orders/${encodeURIComponent(awb)}/`, {
    headers: { Authorization: `Token ${creds.token}` },
    signal: AbortSignal.timeout(45_000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: body.status || body.data?.status || 'unknown', raw: body };
}

export async function checkServiceability(pincode, _creds) {
  // Shadowfax serviceability varies by contract; default allow and let create fail loudly.
  return { serviceable: /^\d{6}$/.test(String(pincode)), etaDays: 3 };
}
