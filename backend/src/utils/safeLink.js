/** Allow only same-site paths and http(s) URLs for admin-entered links; anything else (javascript:, data:, ...) becomes null. */
export function safeLink(value, { allowRelative = true } = {}) {
  const v = String(value ?? '').trim();
  if (!v || v.length > 2000) return null;
  if (allowRelative && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\')) return v;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}
