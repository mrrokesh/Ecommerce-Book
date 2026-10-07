import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

function siteOrigin(req) {
  const env = (process.env.CLIENT_URL || '').split(',')[0].trim();
  if (env && !env.includes('localhost')) return env.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  return `${proto}://${req.get('host')}`.replace(/\/$/, '');
}

router.get('/robots.txt', (req, res) => {
  const origin = siteOrigin(req);
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /checkout\nSitemap: ${origin}/api/sitemap.xml\n`);
});

router.get('/sitemap.xml', async (req, res) => {
  try {
    const origin = siteOrigin(req);
    const { rows } = await query(
      `SELECT slug, updated_at, created_at FROM books WHERE is_active = TRUE ORDER BY id DESC LIMIT 5000`
    );
    const urls = [
      '',
      '/shop',
      '/exams',
      '/stores',
      '/publishers',
      '/about',
      '/contact',
    ].map((p) => `  <url><loc>${origin}${p || '/'}</loc><changefreq>daily</changefreq></url>`);
    for (const b of rows) {
      const last = new Date(b.updated_at || b.created_at || Date.now()).toISOString();
      urls.push(`  <url><loc>${origin}/books/${b.slug}</loc><lastmod>${last}</lastmod></url>`);
    }
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`
    );
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('sitemap error');
  }
});

export default router;
