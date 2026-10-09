import { query, getPool } from '../db/pool.js';

const real = await query(`
  UPDATE books
  SET image_url = '/api/covers/isbn/' || regexp_replace(split_part(image_url, '/', 4), '\\.(jpg|png)$', '', 'i')
  WHERE image_url ~ '^/uploads/covers/[0-9]+\\.(jpg|png)$'
  RETURNING id, image_url
`);
console.log('real → api', real.rowCount);

const svg = await query(`
  UPDATE books
  SET image_url = '/api/covers/' || slug || '.svg'
  WHERE image_url LIKE '/uploads/catalog/%.svg'
  RETURNING id
`);
console.log('svg → api', svg.rowCount);

const p = await getPool();
await p.end();
