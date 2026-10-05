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

export function sanitizeImageUrl(url, slug) {
  if (!url || isBlockedImage(url)) return coverPath(slug);
  return url;
}

export function renderCoverSvg(title, slug) {
  const hue = [...String(slug || title)].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const label = String(title || 'Salem Book House')
    .replace(/&/g, 'and')
    .replace(/[<>]/g, '')
    .slice(0, 42);
  const line1 = label.slice(0, 21);
  const line2 = label.slice(21, 42);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520" viewBox="0 0 400 520">
  <rect width="400" height="520" fill="hsl(${hue},38%,90%)"/>
  <rect x="28" y="28" width="344" height="390" rx="18" fill="hsl(${hue},48%,28%)"/>
  <text x="200" y="200" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-size="20">${line1}</text>
  <text x="200" y="230" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-size="20">${line2}</text>
  <text x="200" y="470" text-anchor="middle" fill="hsl(${hue},45%,22%)" font-family="Georgia,serif" font-size="16">Salem Book House</text>
</svg>`;
}
