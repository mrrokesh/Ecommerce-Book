import 'dotenv/config';
import { initSchema } from '../db/init.js';
import { query, getPool } from '../db/pool.js';

await initSchema();
const cols = await query(
  `SELECT column_name FROM information_schema.columns
   WHERE table_name = 'books'
     AND column_name IN ('source','source_label','created_by','updated_by','created_by_name','updated_by_name','updated_at')
   ORDER BY 1`
);
console.log('columns', cols.rows.map((r) => r.column_name).join(', '));
await query(
  `UPDATE books
   SET source = 'erp',
       source_label = COALESCE(NULLIF(source_label, ''), 'Rokesh ERP'),
       updated_at = COALESCE(updated_at, created_at)
   WHERE erp_id IS NOT NULL AND (source IS NULL OR source = 'manual')`
);
console.log('existing ERP products tagged');
const pool = await getPool();
await pool.end?.();
