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

export function bookImage(book) {
  return book?.image_url || book?.imageUrl || book?.image || '/placeholder-book.svg';
}

export function bookAuthor(book) {
  return book?.author_name || book?.authorName || book?.author || 'Unknown';
}
