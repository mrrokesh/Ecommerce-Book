import { query } from '../db/pool.js';
export const defaults = { shippingFee: 40, freeShippingThreshold: 499, returnDays: 7, lowStockThreshold: 5, restrictedCoverage: false };
export async function storeSettings(run = query) {
  const { rows } = await run("SELECT value FROM site_settings WHERE key = 'commerce'");
  return { ...defaults, ...rows[0]?.value };
}
export async function deliveryQuote(pin, subtotal, run = query) {
  if (!/^[1-9]\d{5}$/.test(String(pin || ''))) throw new Error('Enter a valid six-digit delivery pincode');
  const settings = await storeSettings(run);
  const { rows } = await run('SELECT * FROM pincodes WHERE pincode = $1', [pin]);
  if (settings.restrictedCoverage && !rows[0]) throw new Error('Delivery is unavailable for this pincode');
  const shipping = subtotal >= settings.freeShippingThreshold ? 0 : Number(rows[0]?.shipping ?? settings.shippingFee);
  return { shipping, serviceable: true, etaDays: rows[0]?.eta_days ?? 5, ...settings };
}
