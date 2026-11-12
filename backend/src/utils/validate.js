/** Server-side field checks. They mirror the storefront and admin forms; each returns an error message or '' when fine. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function phoneDigits(value) {
  let d = String(value ?? '').replace(/[\s().-]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  d = d.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

export const checks = {
  email: (v) => (String(v ?? '').trim().length <= 254 && EMAIL.test(String(v ?? '').trim()) ? '' : 'Enter a valid email address'),
  phone: (v) => (/^[6-9]\d{9}$/.test(phoneDigits(v)) ? '' : 'Enter a valid 10-digit mobile number'),
  pincode: (v) => (/^[1-9]\d{5}$/.test(String(v ?? '').trim()) ? '' : 'Enter a valid 6-digit pincode'),
  name: (v) => {
    const s = String(v ?? '').trim();
    if (s.length < 2 || s.length > 80) return 'Enter a name of 2 to 80 characters';
    return /^[\p{L}][\p{L}\p{M} .'’-]*$/u.test(s) ? '' : 'Names can only contain letters';
  },
  password: (v) => {
    const s = String(v ?? '');
    if (s.length < 8 || s.length > 128) return 'Password must be 8 to 128 characters';
    return /[A-Za-z]/.test(s) && /\d/.test(s) ? '' : 'Password needs at least one letter and one number';
  },
  text: (v, label, { min = 1, max = 200 } = {}) => {
    const s = String(v ?? '').trim();
    if (s.length < min) return `${label} is required`;
    return s.length > max ? `${label} must be at most ${max} characters` : '';
  },
};

/** First error among [[check, value, label?, opts?], ...] or '' when all pass. Optional fields: pass skipEmpty. */
export function firstError(list) {
  for (const [kind, value, label, opts] of list) {
    if (opts?.skipEmpty && !String(value ?? '').trim()) continue;
    const fn = checks[kind];
    const message = kind === 'text' ? fn(value, label, opts) : fn(value);
    if (message) return label && kind !== 'text' ? `${label}: ${message}` : message;
  }
  return '';
}

export function normalisePhone(value) {
  return phoneDigits(value);
}
