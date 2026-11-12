import { useEffect } from 'react';
import { phoneDigits, validateRule, type Rule } from '../utils/validators';

/**
 * Live form validation for every form in the app (storefront and admin).
 *
 * It listens at the document level, so no form needs wiring. Each field's rule is read from
 * `data-validate="email|phone|pincode|name|new-password|url|link|upi|card-number|card-expiry|cvv|code|slug|isbn|gstin|ifsc"`
 * or guessed from the input type, name, placeholder and label text, plus the standard
 * required / min / max / minlength / maxlength / pattern attributes. Opt out with `data-no-validate`.
 * Errors appear under the field while typing (after the first visit) and block the submit.
 */

const SKIP_TYPES = new Set(['hidden', 'checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image', 'range', 'color', 'search', 'date', 'datetime-local', 'time', 'month', 'week']);
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const touched = new WeakSet<Field>();
const errors = new WeakMap<Field, HTMLElement>();
let sanitizing = false;

function labelText(el: Field): string {
  const wrap = el.closest('label');
  if (wrap) return (wrap.textContent || '').replace(/\s+/g, ' ').trim();
  if (el.id) {
    const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (l) return (l.textContent || '').trim();
  }
  return el.getAttribute('aria-label') || '';
}

function inAdmin(): boolean {
  return window.location.pathname.startsWith('/admin');
}

function ruleFor(el: Field): Rule | null {
  const explicit = (el as HTMLElement).dataset.validate as Rule | undefined;
  if (explicit) return explicit;
  if (el instanceof HTMLSelectElement) return null;
  const type = (el as HTMLInputElement).type;
  const name = (el.getAttribute('name') || '').toLowerCase();
  const hint = `${name} ${el.id} ${el.getAttribute('autocomplete') || ''} ${el.getAttribute('placeholder') || ''} ${labelText(el)}`.toLowerCase();
  const label = labelText(el).toLowerCase().replace(/[*(].*$/, '').trim();

  if (type === 'email' || /\be-?mail\b/.test(hint)) return 'email';
  if (type === 'tel' || /(phone|mobile|whatsapp)/.test(hint)) return 'phone';
  if (/(pin ?code|postal|zip)/.test(hint)) return 'pincode';
  if (/cvv|cvc|security code/.test(hint)) return 'cvv';
  if (/card ?number/.test(hint)) return 'card-number';
  if (/expiry|mm\/yy/.test(hint)) return 'card-expiry';
  if (/\bupi\b/.test(hint)) return 'upi';
  if (/coupon ?code|gift ?card ?code|giftcardcode|couponcode/.test(name)) return 'code';
  if (type === 'url') return 'url';
  if (type === 'password' && (el.getAttribute('autocomplete') === 'new-password')) return 'new-password';
  if (!inAdmin() && (['name', 'fullname', 'full_name', 'cardname'].includes(name) || /^(full name|your name|name|first name|last name|name on card)$/.test(label))) return 'name';
  return null;
}

function messageFor(el: Field): string {
  const raw = el.value ?? '';
  const value = raw.trim();
  const required = el.required || (el as HTMLElement).dataset.required === 'true';

  if (el instanceof HTMLSelectElement) return required && !value ? 'Please choose an option' : '';
  if (!value) return required ? 'This field is required' : '';

  const rule = ruleFor(el);
  if (rule) {
    const m = validateRule(rule, raw);
    if (m) return m;
  }

  const input = el as HTMLInputElement;
  if (input.type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n) || raw.trim() === '') return 'Enter a number';
    if (input.min !== '' && n < Number(input.min)) return `Enter ${Number(input.min) === 0 ? 'zero or more' : `at least ${input.min}`}`;
    if (input.max !== '' && n > Number(input.max)) return `Enter ${input.max} or less`;
    if (input.step && input.step !== 'any' && Number(input.step) >= 1 && !Number.isInteger((n - (input.min ? Number(input.min) : 0)) / Number(input.step))) return 'Enter a whole number';
  }
  if (input.minLength > 0 && value.length < input.minLength) return `Use at least ${input.minLength} characters`;
  if (input.maxLength > 0 && raw.length > input.maxLength) return `Use at most ${input.maxLength} characters`;
  const pattern = input.getAttribute('pattern');
  if (pattern) {
    try {
      if (!new RegExp(`^(?:${pattern})$`, 'u').test(raw)) return input.title || 'Enter the value in the requested format';
    } catch {
      /* ignore a bad pattern */
    }
  }
  // Sensible ceilings so a stray paste cannot send megabytes
  if (!(el instanceof HTMLTextAreaElement) && raw.length > 500) return 'This is too long (500 characters max)';
  if (el instanceof HTMLTextAreaElement && raw.length > 20000) return 'This is too long (20,000 characters max)';
  return '';
}

function isChecked(el: Field): boolean {
  const e = el as HTMLElement;
  if (e.closest('[data-no-validate]') || e.hasAttribute('data-no-validate')) return false;
  if (el.disabled || (el as HTMLInputElement).readOnly) return false;
  const type = (el as HTMLInputElement).type;
  if (SKIP_TYPES.has(type)) return false;
  // Hidden panels (for example card fields while paying by UPI) are not validated
  if (el.getClientRects().length === 0) return false;
  return true;
}

function show(el: Field, message: string) {
  let box = errors.get(el);
  if (!message) {
    el.removeAttribute('aria-invalid');
    el.classList.remove('fg-invalid');
    if (box) {
      box.remove();
      errors.delete(el);
    }
    return;
  }
  if (!box || !box.isConnected) {
    box = document.createElement('small');
    box.className = 'fg-error';
    box.setAttribute('role', 'alert');
    box.id = `fg-${Math.random().toString(36).slice(2, 9)}`;
    el.insertAdjacentElement('afterend', box);
    errors.set(el, box);
  }
  box.textContent = message;
  el.setAttribute('aria-invalid', 'true');
  el.setAttribute('aria-describedby', box.id);
  el.classList.add('fg-invalid');
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Keep digit-only fields clean as the person types. */
function sanitize(el: Field) {
  if (!(el instanceof HTMLInputElement) || el.type === 'password' || el.type === 'number') return;
  const rule = ruleFor(el);
  let next = el.value;
  if (rule === 'pincode') next = next.replace(/\D/g, '').slice(0, 6);
  else if (rule === 'phone') next = next.replace(/[^\d+\s-]/g, '').slice(0, 16);
  else if (rule === 'cvv') next = next.replace(/\D/g, '').slice(0, 4);
  else if (rule === 'card-number') next = next.replace(/[^\d\s]/g, '').slice(0, 23);
  if (next !== el.value) {
    sanitizing = true;
    setNativeValue(el, next);
    sanitizing = false;
  }
}

function asField(target: EventTarget | null): Field | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return isChecked(target) ? target : null;
  return null;
}

export default function FormGuard() {
  useEffect(() => {
    function onInput(e: Event) {
      if (sanitizing) return;
      const el = asField(e.target);
      if (!el) return;
      sanitize(el);
      if (touched.has(el) || errors.has(el)) show(el, messageFor(el));
    }
    function onBlur(e: Event) {
      const el = asField(e.target);
      if (!el) return;
      touched.add(el);
      show(el, messageFor(el));
    }
    function onChange(e: Event) {
      const el = asField(e.target);
      if (el instanceof HTMLSelectElement && touched.has(el)) show(el, messageFor(el));
    }
    function onSubmit(e: Event) {
      const form = e.target as HTMLFormElement;
      if (!(form instanceof HTMLFormElement) || form.hasAttribute('data-no-validate')) return;
      let first: Field | null = null;
      form.querySelectorAll<Field>('input, textarea, select').forEach((el) => {
        if (!isChecked(el)) return;
        touched.add(el);
        const message = messageFor(el);
        show(el, message);
        if (message && !first) first = el;
      });
      if (first) {
        e.preventDefault();
        e.stopImmediatePropagation();
        (first as Field).focus({ preventScroll: false });
        (first as Field).scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    // Use our messages instead of the browser's native pop-up bubbles
    const markForms = (root: ParentNode) => root.querySelectorAll('form').forEach((f) => { f.noValidate = true; });
    markForms(document);
    const observer = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => {
        if (n instanceof HTMLFormElement) n.noValidate = true;
        else if (n instanceof HTMLElement) markForms(n);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('input', onInput, true);
    document.addEventListener('focusout', onBlur, true);
    document.addEventListener('change', onChange, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('focusout', onBlur, true);
      document.removeEventListener('change', onChange, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);
  return null;
}

export { phoneDigits };
