// Guards for admin-configured outbound carrier endpoints (SSRF and credential-forwarding defence).

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

function isPrivateHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return PRIVATE_V4.some((re) => re.test(h));
  if (h.includes(':')) {
    // IPv6 literal: loopback, unspecified, unique-local, link-local, IPv4-mapped
    return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:');
  }
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return true; // decimal/hex IPv4 tricks
  return false;
}

/**
 * Returns the normalised URL string, or throws an Error with a customer-safe message.
 * https only in production; http is allowed for non-production so local stubs still work.
 */
export function assertSafeEndpoint(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    throw new Error('Carrier endpoint must be a valid URL');
  }
  const production = process.env.NODE_ENV === 'production';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && !production)) {
    throw new Error('Carrier endpoint must use https');
  }
  if (u.username || u.password) throw new Error('Carrier endpoint must not contain credentials');
  if (isPrivateHost(u.hostname) && production) {
    throw new Error('Carrier endpoint must be a public host');
  }
  return u.toString();
}
