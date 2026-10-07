const BASE = 'https://track.delhivery.com';

export async function createShipment(order, creds) {
  if (!creds?.token) throw new Error('Delhivery API token is required in Shipping settings');
  const pin = String(order.shippingAddress || '').match(/\b(\d{6})\b/)?.[1] || '636001';
  const phone = String(order.shippingPhone || '').replace(/\D/g, '').slice(-10);
  const payload = {
    shipments: [
      {
        name: order.shippingName,
        add: order.shippingAddress,
        pin,
        city: order.city || 'Salem',
        state: order.state || 'Tamil Nadu',
        country: 'India',
        phone,
        order: order.orderNumber,
        payment_mode: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
        products_desc: (order.items || []).map((i) => i.title).join(', ').slice(0, 200) || 'Books',
        cod_amount: order.paymentMethod === 'cod' ? Number(order.total || 0) : 0,
        total_amount: Number(order.total || 0),
        quantity: (order.items || []).reduce((s, i) => s + (i.quantity || 1), 0) || 1,
      },
    ],
    pickup_location: { name: creds.pickupName || 'Salem Book House' },
  };
  const res = await fetch(`${BASE}/api/cmu/create.json`, {
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
    throw new Error(body.rmk || body.message || `Delhivery HTTP ${res.status}`);
  }
  const pkg = body.packages?.[0] || body.shipment_data?.[0] || {};
  const awb = pkg.waybill || pkg.wbn || body.waybill || null;
  return {
    ok: true,
    carrier: 'delhivery',
    awb,
    shipmentId: String(pkg.refnum || order.orderNumber),
    trackingUrl: awb ? `https://www.delhivery.com/track/package/${awb}` : null,
    raw: body,
  };
}

export async function trackShipment(awb, creds) {
  const res = await fetch(`${BASE}/api/v1/packages/json/?waybill=${encodeURIComponent(awb)}`, {
    headers: { Authorization: `Token ${creds.token}` },
    signal: AbortSignal.timeout(45_000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: body.ShipmentData?.[0]?.Shipment?.Status?.Status || 'unknown', raw: body };
}

export async function checkServiceability(pincode, creds) {
  if (!creds?.token) return { serviceable: true, etaDays: 4 };
  try {
    const res = await fetch(`${BASE}/c/api/pin-codes/json/?filter_codes=${pincode}`, {
      headers: { Authorization: `Token ${creds.token}` },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json().catch(() => ({}));
    const row = body.delivery_codes?.[0]?.postal_code;
    return { serviceable: Boolean(row), etaDays: 4, raw: body };
  } catch {
    return { serviceable: true, etaDays: 4 };
  }
}
