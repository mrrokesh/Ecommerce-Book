/**
 * Replace one book cover media row with a corrected (rotated) image.
 *
 * Usage: node src/scripts/fixSidewaysCovers.js <media-id> <path-to-fixed.jpg>
 *
 * Other landscape covers are handled on the storefront by CoverImage (CSS rotate).
 */
import fs from 'fs';
import { query, getPool } from '../db/pool.js';

const [mediaId, fixedPath] = process.argv.slice(2);
if (!mediaId || !fixedPath) {
  console.error('Usage: node src/scripts/fixSidewaysCovers.js <media-id> <path-to-fixed.jpg>');
  process.exit(1);
}
if (!fs.existsSync(fixedPath)) {
  console.error('File not found:', fixedPath);
  process.exit(1);
}

try {
  const buf = fs.readFileSync(fixedPath);
  const { rowCount } = await query(`UPDATE media SET data = $2, mime = 'image/jpeg' WHERE id = $1`, [
    mediaId,
    buf,
  ]);
  console.log('updated media rows:', rowCount);
  if (!rowCount) process.exitCode = 1;
} finally {
  await (await getPool()).end();
}
