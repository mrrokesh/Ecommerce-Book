/**
 * Field validators shared by the storefront and the admin panel. Each returns an error message,
 * or '' when the value is acceptable. Empty values are handled by the caller (required or not).
 */

export type Rule =
  | 'email'
  | 'phone'
  | 'pincode'
  | 'name'
  | 'new-password'
  | 'url'
  | 'link'
  | 'upi'
  | 'card-number'
  | 'card-expiry'
  | 'cvv'
  | 'code'
  | 'slug'
  | 'isbn'
  | 'gstin'
  | 'ifsc';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Digits of an Indian mobile number with any +91 / 91 / 0 prefix, spaces and dashes removed. */
export function phoneDigits(value: string): string {
  let d = value.replace(/[\s().-]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  d = d.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function isbnOk(raw: string): boolean {
  const s = raw.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{13}$/.test(s)) {
    const sum = [...s].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((a, c, i) => a + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  return false;
}

export function validateRule(rule: Rule, raw: string): string {
  const value = raw.trim();
  switch (rule) {
    case 'email':
      if (value.length > 254 || !EMAIL.test(value)) return 'Enter a valid email address, like name@example.com';
      return '';
    case 'phone':
      return /^[6-9]\d{9}$/.test(phoneDigits(value)) ? '' : 'Enter a valid 10-digit mobile number';
    case 'pincode':
      return /^[1-9]\d{5}$/.test(value) ? '' : 'Enter a valid 6-digit pincode';
    case 'name':
      if (value.length < 2) return 'Enter at least 2 characters';
      if (value.length > 80) return 'Keep the name under 80 characters';
      return /^[\p{L}][\p{L}\p{M} .'’-]*$/u.test(value) ? '' : 'Use letters only (no digits or symbols)';
    case 'new-password':
      if (value.length < 8) return 'Use at least 8 characters';
      if (value.length > 128) return 'Use at most 128 characters';
      if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Include at least one letter and one number';
      return '';
    case 'url':
      try {
        const u = new URL(value);
        return u.protocol === 'https:' || u.protocol === 'http:' ? '' : 'Enter a web address starting with http:// or https://';
      } catch {
        return 'Enter a full web address, like https://example.com';
      }
    case 'link':
      if (value.startsWith('/') && !value.startsWith('//')) return '';
      return validateRule('url', value);
    case 'upi':
      return /^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$/.test(value) ? '' : 'Enter a valid UPI ID, like name@bank';
    case 'card-number': {
      const d = value.replace(/[\s-]/g, '');
      return /^\d{13,19}$/.test(d) && luhn(d) ? '' : 'Enter a valid card number';
    }
    case 'card-expiry': {
      const m = value.match(/^(0[1-9]|1[0-2])\s*\/\s*(\d{2})$/);
      if (!m) return 'Use MM/YY, like 08/28';
      const end = new Date(2000 + Number(m[2]), Number(m[1]), 1).getTime();
      return end > Date.now() ? '' : 'This card has expired';
    }
    case 'cvv':
      return /^\d{3,4}$/.test(value) ? '' : 'Enter the 3 or 4 digit security code';
    case 'code':
      return /^[A-Za-z0-9-]{3,32}$/.test(value) ? '' : 'Use 3 to 32 letters, numbers or dashes';
    case 'slug':
      return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? '' : 'Use lowercase letters, numbers and single dashes (like tamil-novels)';
    case 'isbn':
      return isbnOk(value) ? '' : 'Enter a valid 10 or 13 digit ISBN';
    case 'gstin':
      return /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value.toUpperCase()) ? '' : 'Enter a valid 15-character GSTIN';
    case 'ifsc':
      return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.toUpperCase()) ? '' : 'Enter a valid IFSC code';
    default:
      return '';
  }
}
