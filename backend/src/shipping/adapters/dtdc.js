export async function createShipment(order, creds) {
  if (!creds?.apiKey || !creds?.customerCode) {
    throw new Error('DTDC apiKey and customerCode are required in Shipping settings');
  }
  if (!creds.endpoint) {
    return {
      ok: true,
      deferred: true,
      carrier: 'dtdc',
      awb: null,
      shipmentId: order.orderNumber,
      trackingUrl: null,
      message: 'DTDC credentials saved. Set endpoint or enter AWB manually after booking.',
    };
  }
  const pin = String(order.shippingAddress || '').match(/\b(\d{6})\b/)?.[1] || '636001';
  const res = await fetch(creds.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': creds.apiKey,
      'customer-code': creds.customerCode,
    },
    body: JSON.stringify({
      consignments: [
        {
          customer_reference_number: order.orderNumber,
          consignee_name: order.shippingName,
          consignee_address: order.shippingAddress,
          consignee_pincode: pin,
          consignee_mobile: String(order.shippingPhone || '').replace(/\D/g, '').slice(-10),
          product_code: order.paymentMethod === 'cod' ? 'COD' : 'B2C',
          declared_value: Number(order.total || 0),
          weight: 0.5,
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `DTDC HTTP ${res.status}`);
  const awb = body.data?.[0]?.reference_number || body.awb || null;
  return {
    ok: true,
    carrier: 'dtdc',
    awb,
    shipmentId: order.orderNumber,
    trackingUrl: awb ? `https://www.dtdc.in/tracking/tracking_results.asp?Ttype=awb_no&strCnno=${awb}` : null,
    raw: body,
  };
}

export async function trackShipment(awb) {
  return {
    ok: true,
    status: 'unknown',
    trackingUrl: `https://www.dtdc.in/tracking/tracking_results.asp?Ttype=awb_no&strCnno=${awb}`,
  };
}

export async function checkServiceability(pincode) {
  return { serviceable: /^\d{6}$/.test(String(pincode)), etaDays: 4 };
}
