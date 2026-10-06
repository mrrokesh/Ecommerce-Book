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
  return /sapnaonline|sapna\.com|cdn01\.sapna|\/api\/covers\//i.test(String(url || ''));
}

export function isbnCoverUrl(isbn?: unknown) {
  const digits = String(isbn || '').replace(/\D/g, '');
  if (digits.length !== 10 && digits.length !== 13) return '';
  return `https://covers.openlibrary.org/b/isbn/${digits}-L.jpg`;
}

export function generatedCover(title?: string, slug?: string) {
  const hue = [...String(slug || title || 'sbh')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const label = String(title || 'Salem Book House').replace(/&/g, 'and').replace(/[<>]/g, '').slice(0, 42);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520" viewBox="0 0 400 520"><rect width="400" height="520" fill="hsl(${hue},38%,90%)"/><rect x="28" y="28" width="344" height="390" rx="18" fill="hsl(${hue},48%,28%)"/><text x="200" y="210" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-size="20">${label.slice(0, 21)}</text><text x="200" y="470" text-anchor="middle" fill="hsl(${hue},45%,22%)" font-family="Georgia,serif" font-size="16">Salem Book House</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function mediaUrl(url?: string, slug?: string, title?: string, isbn?: unknown) {
  const src = url || '';
  if (src.startsWith('data:image/svg')) return src;
  if (src && !isBlockedImage(src)) {
    if (/^https?:\/\//i.test(src) || src.startsWith('data:') || src.startsWith('/')) return src;
    return src;
  }
  const fromIsbn = isbnCoverUrl(isbn);
  if (fromIsbn) return fromIsbn;
  if (slug || title) return generatedCover(title, slug);
  return '/placeholder-book.svg';
}

export function bookImage(book?: Book | null) {
  const src = book?.image_url || book?.imageUrl || book?.image || '';
  return mediaUrl(src, book?.slug, book?.title, book?.isbn13 || book?.isbn10 || book?.isbn);
}

export function onCoverError(event: { currentTarget: HTMLImageElement }, book?: Book | null) {
  const el = event.currentTarget;
  if (el.dataset.coverFb === '1') return;
  el.dataset.coverFb = '1';
  el.src = generatedCover(book?.title, book?.slug);
}

export function bookAuthor(book?: Book | null) {
  return book?.author_name || book?.authorName || book?.author || 'Unknown';
}
