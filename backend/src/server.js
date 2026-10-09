import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import app from './app.js';
import { query } from './db/pool.js';
import { initSchema } from './db/init.js';
import { seedDatabase } from './db/seed.js';

if (process.env.NODE_ENV === 'production') {
  const s = String(process.env.JWT_SECRET || '');
  if (s.length < 24 || /change-me|dev-secret/i.test(s)) {
    console.error('Refusing to start: set a strong JWT_SECRET (24+ chars) in production.');
    process.exit(1);
  }
}

const PORT = Number(process.env.PORT) || 5000;

async function setupDatabase() {
  await initSchema();
  const { rows } = await query(`SELECT COUNT(*)::int AS c FROM books`);
  if (rows[0].c === 0) {
    console.log('Books table empty — seeding from scrape data...');
    await seedDatabase();
  } else {
    console.log(`Database ready with ${rows[0].c} books`);
  }
  const { seedExtras } = await import('./db/extraSeed.js');
  const { replaceSapnaImages } = await import('./db/replaceSapnaImages.js');
  const { startErpAutoSync } = await import('./erp/syncProducts.js');
  startErpAutoSync();
  setTimeout(() => {
    seedExtras().catch((err) => console.warn('seedExtras:', err.message || err));
    replaceSapnaImages().catch((err) => console.warn('replaceSapnaImages:', err.message || err));
  }, 15_000).unref();
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Salem Book House API listening on port ${PORT}`);
  setupDatabase().catch((err) => {
    console.error('Boot DB setup failed:', err);
  });
});
