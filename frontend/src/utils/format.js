export function formatPrice(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '₹0';
  return `₹${Math.round(num).toLocaleString('en-IN')}`;
}

export function discountLabel(percent) {
  const p = Number(percent);
  if (!p || p <= 0) return null;
  return `(${Math.round(p)}% Off)`;
}

function isBlockedImage(url) {
  return /sapnaonline|sapna\.com|cdn01\.sapna/i.test(String(url || ''));
}

export function mediaUrl(url, slug) {
  const src = url || '';
  if (!src || isBlockedImage(src)) {
    if (slug) return `/api/covers/${encodeURIComponent(slug)}.svg`;
    return '/placeholder-book.svg';
  }
  if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return src;
  if (typeof window !== 'undefined' && /\.vercel\.app$/.test(window.location.hostname)) {
    return src;
  }
  if (src.startsWith('/uploads') || src.startsWith('/api/')) {
    const api = String(import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
    if (api && api.startsWith('http')) return `${api}${src}`;
  }
  return src;
}

export function bookImage(book) {
  const src = book?.image_url || book?.imageUrl || book?.image || '';
  return mediaUrl(src, book?.slug);
}

export function bookAuthor(book) {
  return book?.author_name || book?.authorName || book?.author || 'Unknown';
}
