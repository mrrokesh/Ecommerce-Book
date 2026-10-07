/**
 * BlueDart uses SOAP/XML in many accounts. We call their REST-style gateway when
 * credentials are present; otherwise createShipment fails with a clear setup message.
 */
export async function createShipment(order, creds) {
  if (!creds?.loginId || !creds?.licenseKey) {
    throw new Error('BlueDart loginId and licenseKey are required in Shipping settings');
  }
  if (!creds.endpoint) {
    // Store AWB locally for ops until client pastes their BlueDart REST endpoint.
    return {
      ok: true,
      deferred: true,
      carrier: 'bluedart',
      awb: null,
      shipmentId: order.orderNumber,
      trackingUrl: null,
      message:
        'BlueDart credentials saved. Set endpoint URL in partner config (or enter AWB manually) to auto-create shipments.',
    };
  }
  const pin = String(order.shippingAddress || '').match(/\b(\d{6})\b/)?.[1] || '636001';
  const res = await fetch(creds.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      LoginID: creds.loginId,
      LicenceKey: creds.licenseKey,
      'api-type': creds.apiType || 'S',
    },
    body: JSON.stringify({
      CustomerCode: creds.customerCode,
      Consignee: {
        Name: order.shippingName,
        Address: order.shippingAddress,
        Pincode: pin,
        Mobile: String(order.shippingPhone || '').replace(/\D/g, '').slice(-10),
      },
      Services: {
        ProductCode: 'A',
        ProductType: order.paymentMethod === 'cod' ? 'C' : 'D',
        PieceCount: 1,
        ActualWeight: 0.5,
        CollectableAmount: order.paymentMethod === 'cod' ? Number(order.total || 0) : 0,
        DeclaredValue: Number(order.total || 0),
        CreditReferenceNo: order.orderNumber,
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `BlueDart HTTP ${res.status}`);
  const awb = body.AWBNo || body.awb || body.AirWayBillNo || null;
  return {
    ok: true,
    carrier: 'bluedart',
    awb,
    shipmentId: String(body.TokenNumber || order.orderNumber),
    trackingUrl: awb ? `https://www.bluedart.com/tracking/${awb}` : null,
    raw: body,
  };
}

export async function trackShipment(awb, _creds) {
  return {
    ok: true,
    status: 'unknown',
    trackingUrl: `https://www.bluedart.com/tracking/${awb}`,
  };
}

export async function checkServiceability(pincode) {
  return { serviceable: /^\d{6}$/.test(String(pincode)), etaDays: 3 };
}
