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

export function mediaUrl(url) {
  const src = url || '/placeholder-book.svg';
  if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return src;
  if (src.startsWith('/uploads')) {
    const api = String(import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
    return api ? `${api}${src}` : src;
  }
  return src;
}

export function bookImage(book) {
  return mediaUrl(book?.image_url || book?.imageUrl || book?.image || '/placeholder-book.svg');
}

export function bookAuthor(book) {
  return book?.author_name || book?.authorName || book?.author || 'Unknown';
}
