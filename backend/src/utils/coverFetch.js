import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(__dirname, '../../uploads/covers');
fs.mkdirSync(cacheDir, { recursive: true });

/** Known blank/skeleton cover payloads from OL & Google (full MD5). */
const BAD_MD5 = new Set([
  'd7c21c65fc861fc5128753e9e091b23c', // Google striped skeleton ~10KB (zoom=1)
  'e89e0e364e83c0ecfba5da41007c9a2c', // Google tiny "no cover" PNG
  'a64fa89d7ebc97075c1d363fc5fea71f', // Google zoom0/2 skeleton
  'd41d8cd98f00b204e9800998ecf8427e', // empty
]);

const BAD_MD5_PREFIX = [
  'd7c21c65fc861fc5',
  'e89e0e364e83c0ec',
  'a64fa89d7ebc9707',
  '1fe98bd081e1f98c',
];

function isbnDigits(isbn) {
  const digits = String(isbn || '').replace(/\D/g, '');
  if (digits.length !== 10 && digits.length !== 13) return '';
  return digits;
}

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

function isBadCover(buf) {
  if (!buf || buf.length < 2000) return true;
  const hash = md5(buf);
  if (BAD_MD5.has(hash)) return true;
  if (BAD_MD5_PREFIX.some((p) => hash.startsWith(p))) return true;
  return false;
}

async function fetchBuffer(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'SalemBookHouse/1.0 (cover-resolver)',
        Accept: 'image/*,*/*',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ctype = String(res.headers.get('content-type') || '');
    if (ctype && !/^image\//i.test(ctype) && !/octet-stream/i.test(ctype)) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function mimeOf(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

/**
 * Resolve a real cover for an ISBN: Open Library → Google Books (validated).
 * Caches successes and misses under uploads/covers/.
 */
export async function resolveIsbnCover(isbn) {
  const digits = isbnDigits(isbn);
  if (!digits) return null;

  const hitJpg = path.join(cacheDir, `${digits}.jpg`);
  const hitPng = path.join(cacheDir, `${digits}.png`);
  const miss = path.join(cacheDir, `${digits}.missing`);

  if (fs.existsSync(hitJpg)) {
    return { buffer: fs.readFileSync(hitJpg), mime: 'image/jpeg', digits };
  }
  if (fs.existsSync(hitPng)) {
    return { buffer: fs.readFileSync(hitPng), mime: 'image/png', digits };
  }
  if (fs.existsSync(miss)) {
    const age = Date.now() - fs.statSync(miss).mtimeMs;
    if (age < 7 * 24 * 60 * 60 * 1000) return null;
  }

  const candidates = [
    `https://covers.openlibrary.org/b/isbn/${digits}-L.jpg?default=false`,
    `https://books.google.com/books/content?vid=ISBN${digits}&printsec=frontcover&img=1&zoom=1`,
  ];

  for (const url of candidates) {
    const buf = await fetchBuffer(url);
    if (!buf || isBadCover(buf)) continue;
    const mime = mimeOf(buf);
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const dest = path.join(cacheDir, `${digits}.${ext}`);
    fs.writeFileSync(dest, buf);
    try {
      fs.unlinkSync(miss);
    } catch {
      /* ignore */
    }
    return { buffer: buf, mime, digits };
  }

  fs.writeFileSync(miss, String(Date.now()));
  return null;
}

export function publicIsbnCoverPath(isbn) {
  const digits = isbnDigits(isbn);
  if (!digits) return '';
  return `/api/covers/isbn/${digits}`;
}
