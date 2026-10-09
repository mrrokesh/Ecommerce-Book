export function isBlockedImage(url) {
  const u = String(url || '');
  if (!u) return true;
  return /sapnaonline|sapna\.com|cdn01\.sapna/i.test(u);
}

export function coverPath(slug) {
  const s = String(slug || 'book')
    .replace(/\.svg$/i, '')
    .replace(/[^a-z0-9-]/gi, '-')
    .slice(0, 120);
  return `/api/covers/${s}.svg`;
}

export function coverDataUri(title, slug) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderCoverSvg(title, slug))}`;
}

export function isbnCoverUrl(isbn) {
  const digits = String(isbn || '').replace(/\D/g, '');
  if (digits.length !== 10 && digits.length !== 13) return '';
  // Resolved + validated on our API (skips OL/Google blank skeletons).
  return `/api/covers/isbn/${digits}`;
}

export function sanitizeImageUrl(url, slug, title, isbn) {
  const u = String(url || '');
  if (u && !isBlockedImage(u) && !/covers\.openlibrary\.org|books\.google\.com\/books\/content/i.test(u)) {
    // Keep local API covers, uploads, and real CDN/ERP images.
    return u;
  }
  return isbnCoverUrl(isbn) || (slug ? `/api/covers/${String(slug).replace(/\.svg$/i, '')}.svg` : '');
}

export function renderCoverSvg(title, slug) {
  const hue = [...String(slug || title)].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const hue2 = (hue + 32) % 360;
  const label = String(title || 'Salem Book House')
    .replace(/&/g, 'and')
    .replace(/[<>"']/g, '')
    .slice(0, 48);
  const line1 = label.slice(0, 22);
  const line2 = label.slice(22, 44);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520" viewBox="0 0 400 520">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},42%,92%)"/>
      <stop offset="100%" stop-color="hsl(${hue2},36%,84%)"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},52%,34%)"/>
      <stop offset="100%" stop-color="hsl(${hue},48%,22%)"/>
    </linearGradient>
  </defs>
  <rect width="400" height="520" fill="url(#bg)"/>
  <rect x="22" y="22" width="356" height="404" rx="18" fill="url(#panel)"/>
  <rect x="38" y="38" width="10" height="372" rx="5" fill="hsl(${hue},40%,16%)"/>
  <circle cx="320" cy="90" r="36" fill="hsl(${hue2},45%,48%)" opacity="0.35"/>
  <text x="200" y="210" text-anchor="middle" fill="#fff" font-family="Georgia, 'Times New Roman', serif" font-size="22">${line1}</text>
  <text x="200" y="242" text-anchor="middle" fill="#fff" font-family="Georgia, 'Times New Roman', serif" font-size="22">${line2}</text>
  <text x="200" y="470" text-anchor="middle" fill="hsl(${hue},40%,22%)" font-family="Georgia, 'Times New Roman', serif" font-size="15">Salem Book House</text>
</svg>`;
}
