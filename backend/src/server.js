import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import app from './app.js';
import { query } from './db/pool.js';
import { initSchema } from './db/init.js';
import { seedDatabase } from './db/seed.js';

const PORT = Number(process.env.PORT) || 5000;

async function boot() {
  try {
    await initSchema();
    const { rows } = await query(`SELECT COUNT(*)::int AS c FROM books`);
    if (rows[0].c === 0) {
      console.log('Books table empty — seeding from scrape data...');
      await seedDatabase();
    } else {
      console.log(`Database ready with ${rows[0].c} books`);
    }
    const { seedExtras } = await import('./db/extraSeed.js');
    await seedExtras();
  } catch (err) {
    console.error('Boot DB setup failed:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Salem Book House API listening on http://localhost:${PORT}`);
  });
}

boot();
