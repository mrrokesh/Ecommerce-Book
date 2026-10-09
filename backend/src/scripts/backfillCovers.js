/**
 * Resolve real covers for every book (ISBN → Open Library / Google),
 * cache under uploads/covers, and point image_url at the local file.
 * Books with no public cover get a polished SVG under uploads/catalog.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, getPool } from '../db/pool.js';
import { resolveIsbnCover } from '../utils/coverFetch.js';
import { renderCoverSvg } from '../utils/covers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.join(__dirname, '../../uploads/catalog');
fs.mkdirSync(catalogDir, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isbnDigits(isbn) {
  const digits = String(isbn || '').replace(/\D/g, '');
  if (digits.length !== 10 && digits.length !== 13) return '';
  return digits;
}

function writeSvgCover(title, slug) {
  const safe = String(slug || 'book')
    .replace(/\.svg$/i, '')
    .replace(/[^a-z0-9-]/gi, '-')
    .slice(0, 120);
  const file = `${safe}.svg`;
  const abs = path.join(catalogDir, file);
  fs.writeFileSync(abs, renderCoverSvg(title, safe), 'utf8');
  return `/uploads/catalog/${file}`;
}

export async function backfillCovers({ limit = 0, delayMs = 120 } = {}) {
  const { rows } = await query(
    `SELECT id, title, slug, isbn13, isbn10, image_url
     FROM books
     ORDER BY id`
  );

  const stats = { total: rows.length, real: 0, svg: 0, skipped: 0, errors: 0 };
  let processed = 0;

  for (const book of rows) {
    if (limit && processed >= limit) break;
    processed += 1;

    const current = String(book.image_url || '');
    // Keep real local/CDN uploads that aren't placeholders
    if (
      current &&
      !/openlibrary|books\.google\.com|sapnaonline|cdn01\.sapna|\/api\/covers\//i.test(current) &&
      !current.startsWith('data:image/svg') &&
      (/^https?:\/\//i.test(current) || current.startsWith('/uploads/'))
    ) {
      // Re-check: if it's already our cached cover, count as real
      if (/\/uploads\/covers\//i.test(current)) {
        stats.real += 1;
        stats.skipped += 1;
        continue;
      }
      if (/\/uploads\/catalog\/.+\.svg$/i.test(current)) {
        // allow upgrade if ISBN now resolves
      } else if (!/placeholder/i.test(current)) {
        stats.skipped += 1;
        continue;
      }
    }

    const isbn = isbnDigits(book.isbn13 || book.isbn10);
    try {
      if (isbn) {
        const cover = await resolveIsbnCover(isbn);
        if (cover) {
          // Serve via API so Vercel + Render both work (files cached under uploads/covers).
          const publicPath = `/api/covers/isbn/${isbn}`;
          await query(`UPDATE books SET image_url = $2 WHERE id = $1`, [book.id, publicPath]);
          await query(`UPDATE book_images SET image_url = $2 WHERE book_id = $1 AND sort_order = 0`, [
            book.id,
            publicPath,
          ]).catch(() => {});
          stats.real += 1;
          await sleep(delayMs);
          continue;
        }
      }

      writeSvgCover(book.title, book.slug);
      const svgPath = `/api/covers/${String(book.slug || 'book').replace(/\.svg$/i, '')}.svg`;
      await query(`UPDATE books SET image_url = $2 WHERE id = $1`, [book.id, svgPath]);
      stats.svg += 1;
      if (isbn) await sleep(delayMs);
    } catch (err) {
      stats.errors += 1;
      console.error(`cover fail #${book.id} ${book.title}:`, err.message);
    }

    if (processed % 25 === 0) {
      console.log(`… ${processed}/${rows.length} (real=${stats.real} svg=${stats.svg})`);
    }
  }

  return stats;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  backfillCovers()
    .then(async (stats) => {
      console.log('Cover backfill done:', stats);
      const p = await getPool();
      await p.end();
    })
    .catch(async (err) => {
      console.error(err);
      try {
        const p = await getPool();
        await p.end();
      } catch {
        /* ignore */
      }
      process.exit(1);
    });
}
