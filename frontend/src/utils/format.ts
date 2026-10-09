import type { Book } from '../types';

export function formatPrice(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '₹0';
  return `₹${Math.round(num).toLocaleString('en-IN')}`;
}

export function discountLabel(percent: unknown) {
  const p = Number(percent);
  if (!p || p <= 0) return null;
  return `(${Math.round(p)}% Off)`;
}

function isBlockedImage(url: unknown) {
  return /sapnaonline|sapna\.com|cdn01\.sapna/i.test(String(url || ''));
}

function isUnreliableCoverHost(url: unknown) {
  return /covers\.openlibrary\.org|books\.google\.com\/books\/content/i.test(String(url || ''));
}

export function isbnDigits(isbn?: unknown) {
  const digits = String(isbn || '').replace(/\D/g, '');
  if (digits.length !== 10 && digits.length !== 13) return '';
  return digits;
}

/** Backend validates OL/Google and strips blank skeleton images. */
export function isbnCoverUrl(isbn?: unknown) {
  const digits = isbnDigits(isbn);
  if (!digits) return '';
  return `/api/covers/isbn/${digits}`;
}

export function generatedCover(title?: string, slug?: string) {
  const hue = [...String(slug || title || 'sbh')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const label = String(title || 'Salem Book House').replace(/&/g, 'and').replace(/[<>]/g, '').slice(0, 48);
  const line1 = label.slice(0, 22);
  const line2 = label.slice(22, 44);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520" viewBox="0 0 400 520">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},42%,92%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 28) % 360},36%,84%)"/>
    </linearGradient>
  </defs>
  <rect width="400" height="520" fill="url(#g)"/>
  <rect x="24" y="24" width="352" height="400" rx="16" fill="hsl(${hue},48%,26%)"/>
  <rect x="40" y="40" width="8" height="368" rx="4" fill="hsl(${hue},40%,18%)"/>
  <text x="200" y="200" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-size="22">${line1}</text>
  <text x="200" y="232" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-size="22">${line2}</text>
  <text x="200" y="470" text-anchor="middle" fill="hsl(${hue},40%,22%)" font-family="Georgia,serif" font-size="15">Salem Book House</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function coverCandidates(book?: Book | null): string[] {
  const title = book?.title;
  const slug = book?.slug;
  const isbn = book?.isbn13 || book?.isbn10 || book?.isbn;
  const raw = book?.image_url || book?.imageUrl || book?.image || '';
  const out: string[] = [];
  const push = (u?: string) => {
    if (!u || out.includes(u)) return;
    out.push(u);
  };

  // Prefer DB/API/local covers and real CDN/ERP uploads.
  if (raw && !isBlockedImage(raw) && !isUnreliableCoverHost(raw) && !String(raw).startsWith('data:image/svg')) {
    push(String(raw));
  }

  // Live resolve if DB not backfilled yet
  push(isbnCoverUrl(isbn));
  if (slug) push(`/api/covers/${encodeURIComponent(String(slug).replace(/\.svg$/i, ''))}.svg`);
  push(generatedCover(title, slug));
  push('/placeholder-book.svg');
  return out;
}

export function mediaUrl(url?: string, slug?: string, title?: string, isbn?: unknown) {
  const src = url || '';
  if (src.startsWith('data:image/svg')) return src;
  if (src && !isBlockedImage(src) && !isUnreliableCoverHost(src)) {
    if (/^https?:\/\//i.test(src) || src.startsWith('data:') || src.startsWith('/')) return src;
    return src;
  }
  return isbnCoverUrl(isbn) || generatedCover(title, slug) || '/placeholder-book.svg';
}

export function bookImage(book?: Book | null) {
  return coverCandidates(book)[0] || '/placeholder-book.svg';
}

function advanceCover(el: HTMLImageElement, book?: Book | null) {
  const list = coverCandidates(book);
  const step = Number(el.dataset.coverStep || '0') + 1;
  if (step >= list.length) return;
  el.dataset.coverStep = String(step);
  el.src = list[step];
}

export function onCoverError(event: { currentTarget: HTMLImageElement }, book?: Book | null) {
  advanceCover(event.currentTarget, book);
}

export function onCoverLoad(event: { currentTarget: HTMLImageElement }, book?: Book | null) {
  const el = event.currentTarget;
  if (el.naturalWidth > 2 && el.naturalHeight > 2) return;
  advanceCover(el, book);
}

export function bookAuthor(book?: Book | null) {
  return book?.author_name || book?.authorName || book?.author || 'Unknown';
}
