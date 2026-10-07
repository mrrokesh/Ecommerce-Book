export async function createShipment(order, _creds) {
  return {
    ok: true,
    deferred: true,
    carrier: 'manual',
    awb: null,
    trackingUrl: null,
    shipmentId: null,
    message: 'Manual partner: enter AWB in admin after courier pickup',
  };
}

export async function trackShipment(_awb, _creds) {
  return { ok: true, status: 'unknown', events: [] };
}

export async function checkServiceability(_pincode, _creds) {
  return { serviceable: true, etaDays: 4 };
}
