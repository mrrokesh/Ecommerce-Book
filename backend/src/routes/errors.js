import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db/pool.js';
import { requireBackOffice } from '../middleware/auth.js';
import { openErrorCount, recordError } from '../errors/tracker.js';

const router = Router();

const reportLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many error reports' },
});

/** Public: browser / ErrorBoundary reports. Rate-limited; no secrets accepted. */
router.post('/report', reportLimiter, async (req, res) => {
  const body = req.body || {};
  const row = await recordError({
    source: body.source === 'admin' ? 'admin' : 'client',
    severity: body.severity === 'warning' ? 'warning' : 'error',
    message: body.message,
    stack: body.stack,
    path: body.path || req.path,
    url: body.url,
    userAgent: req.get('user-agent'),
    meta: {
      href: typeof body.href === 'string' ? body.href.slice(0, 500) : undefined,
      line: body.line,
      column: body.column,
    },
  });
  return res.json({ success: true, data: { id: row?.id || null } });
});

router.use(requireBackOffice);

/** Admin-only: open error count for sidebar badge. */
router.get('/counts', async (_req, res) => {
  if (_req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  const open = await openErrorCount();
  return res.json({ success: true, data: { open } });
});

router.get('/', async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  const status = ['open', 'resolved', 'ignored'].includes(String(req.query.status))
    ? String(req.query.status)
    : 'open';
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(10, Number(req.query.pageSize) || 25));
  const offset = (page - 1) * pageSize;
  const { rows } = await query(
    `SELECT id, fingerprint, source, severity, message, stack, path, method, status_code,
            user_agent, url, meta, occurrences, first_seen_at, last_seen_at, status,
            resolved_at, last_emailed_at
       FROM site_errors
      WHERE ($1 = 'all' OR status = $1)
      ORDER BY last_seen_at DESC
      LIMIT $2 OFFSET $3`,
    [status === 'all' ? 'all' : status, pageSize, offset]
  );
  const total = (
    await query(`SELECT COUNT(*)::int AS c FROM site_errors WHERE ($1 = 'all' OR status = $1)`, [
      status === 'all' ? 'all' : status,
    ])
  ).rows[0].c;
  const counts = (
    await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'open')::int AS open,
         COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
         COUNT(*) FILTER (WHERE status = 'ignored')::int AS ignored
       FROM site_errors`
    )
  ).rows[0];
  return res.json({
    success: true,
    data: { errors: rows, page, pageSize, total, counts },
  });
});

router.get('/:id', async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  const { rows } = await query(`SELECT * FROM site_errors WHERE id = $1`, [id]);
  if (!rows[0]) return res.status(404).json({ success: false, error: 'Error not found' });
  return res.json({ success: true, data: { error: rows[0] } });
});

router.patch('/:id', async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  const next = String(req.body?.status || '');
  if (!['open', 'resolved', 'ignored'].includes(next)) {
    return res.status(400).json({ success: false, error: 'Status must be open, resolved or ignored' });
  }
  const { rows } = await query(
    `UPDATE site_errors SET
       status = $2,
       resolved_at = CASE WHEN $2 = 'open' THEN NULL ELSE NOW() END,
       resolved_by = CASE WHEN $2 = 'open' THEN NULL ELSE $3 END
     WHERE id = $1
     RETURNING *`,
    [id, next, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, error: 'Error not found' });
  return res.json({ success: true, data: { error: rows[0] } });
});

export default router;
