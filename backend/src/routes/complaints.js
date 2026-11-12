import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db/pool.js';
import { optionalAuth, requireAuth, requirePermission } from '../middleware/auth.js';
import { mailBudgetOk } from '../mailer.js';
import { firstError } from '../utils/validate.js';
import { complaintReceivedEmail, complaintReplyEmail, complaintResolvedEmail } from '../notify/complaintMail.js';

/**
 * Customer complaints: customers (signed in or not) raise a ticket and follow it with the ticket
 * number plus their email; staff with the "support" permission view, answer and resolve them.
 */
const router = Router();

export const CATEGORIES = {
  order_delivery: 'Order or delivery',
  payment_refund: 'Payment or refund',
  product_quality: 'Product quality',
  website_app: 'Website problem',
  staff_service: 'Staff or service',
  other: 'Other',
};
export const STATUSES = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high'];

const wrap = (fn) => async (req, res) => {
  try {
    res.json({ success: true, data: await fn(req, res) });
  } catch (e) {
    if (!e.status) console.error('complaints:', e);
    res.status(e.status || 500).json({ success: false, error: e.status ? e.message : 'Something went wrong. Please try again.' });
  }
};
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const limiter = (limit, message) =>
  rateLimit({ windowMs: 60 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: { success: false, error: message } });
const raiseLimiter = limiter(6, 'Too many complaints from this connection. Please try again later.');
const lookupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { success: false, error: 'Too many attempts. Please wait and try again.' } });

const cap = (name, fallback) => Number(process.env[name] || fallback);

function mapComplaint(r) {
  return {
    id: r.id,
    ticket: r.ticket,
    name: r.name,
    email: r.email,
    phone: r.phone,
    orderNumber: r.order_number,
    category: r.category,
    categoryLabel: CATEGORIES[r.category] || 'Other',
    subject: r.subject,
    message: r.message,
    status: r.status,
    priority: r.priority,
    assignedTo: r.assigned_to || null,
    assignedName: r.assigned_name || null,
    resolution: r.resolution,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
const mapMessage = (m) => ({ id: m.id, type: m.author_type, author: m.author_name, body: m.body, createdAt: m.created_at });

// ---------------------------------------------------------------- customer side

router.post(
  '/',
  raiseLimiter,
  optionalAuth,
  wrap(async (req) => {
    const b = req.body || {};
    if (String(b.website || '').trim()) throw fail('Could not submit the complaint'); // honeypot field real people never fill
    const category = String(b.category || '');
    const name = req.user ? req.user.name : String(b.name || '').trim();
    const email = (req.user ? req.user.email : String(b.email || '')).trim().toLowerCase();
    const phone = String(b.phone || '').trim();
    const subject = String(b.subject || '').trim();
    const message = String(b.message || '').trim();
    const orderNumber = String(b.orderNumber || '').trim().toUpperCase();
    if (!CATEGORIES[category]) throw fail('Choose what your complaint is about');
    const bad = firstError([
      ['name', name, 'Name'],
      ['email', email, 'Email'],
      ['phone', phone, 'Mobile number', { skipEmpty: true }],
      ['text', subject, 'Subject', { min: 5, max: 120 }],
      ['text', message, 'Details', { min: 20, max: 2000 }],
    ]);
    if (bad) throw fail(bad);
    if (orderNumber && !/^[A-Z0-9-]{3,30}$/.test(orderNumber)) throw fail('Order number can only contain letters, numbers and dashes');

    const daily = await query(
      `SELECT COUNT(*) FILTER (WHERE lower(email) = $1)::int AS mine, COUNT(*)::int AS total
         FROM complaints WHERE created_at > NOW() - INTERVAL '24 hours'`,
      [email]
    );
    if (daily.rows[0].mine >= cap('COMPLAINT_PER_EMAIL_DAILY', 5)) throw fail('You have already raised several complaints today. Please reply on an existing ticket or try again tomorrow.', 429);
    if (daily.rows[0].total >= cap('COMPLAINT_DAILY_CAP', 300)) throw fail('We are receiving a very high number of complaints right now. Please try again later.', 429);

    const { rows } = await query(
      `INSERT INTO complaints (user_id, name, email, phone, order_number, category, subject, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user?.id || null, name, email, phone || null, orderNumber || null, category, subject, message]
    );
    const ticket = 'CMP-' + String(rows[0].id).padStart(6, '0');
    await query('UPDATE complaints SET ticket = $2 WHERE id = $1', [rows[0].id, ticket]);
    const c = { ...rows[0], ticket };
    if (await mailBudgetOk(email, 'We received your complaint', { perRecipient: 5 })) void complaintReceivedEmail(c);
    return { ticket, status: c.status };
  })
);

/** Complaints of the signed-in customer. */
router.get(
  '/mine',
  requireAuth,
  wrap(async (req) => {
    const { rows } = await query('SELECT * FROM complaints WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [req.user.id]);
    return { complaints: rows.map(mapComplaint) };
  })
);

/** Customers can read a ticket when signed in as its owner, or with the ticket number plus the email on it. */
async function ownTicket(req) {
  const ticket = String(req.params.ticket || '').toUpperCase();
  if (!/^CMP-\d{6,}$/.test(ticket)) throw fail('Ticket not found', 404);
  const { rows } = await query('SELECT * FROM complaints WHERE ticket = $1', [ticket]);
  const c = rows[0];
  const email = String(req.query.email || req.body?.email || '').trim().toLowerCase();
  const ownerByLogin = req.user && c && c.user_id && c.user_id === req.user.id;
  const ownerByEmail = c && email && email === String(c.email).toLowerCase();
  if (!c || !(ownerByLogin || ownerByEmail)) throw fail('We could not find a complaint with that ticket number and email', 404);
  return c;
}
async function publicThread(id) {
  const { rows } = await query(
    "SELECT * FROM complaint_messages WHERE complaint_id = $1 AND author_type IN ('customer','staff') ORDER BY created_at, id",
    [id]
  );
  return rows.map(mapMessage);
}

router.get(
  '/t/:ticket',
  lookupLimiter,
  optionalAuth,
  wrap(async (req, res) => {
    const c = await ownTicket(req);
    res.set('Cache-Control', 'no-store');
    const full = mapComplaint(c);
    // Customers never see staff assignment details
    delete full.assignedTo;
    delete full.assignedName;
    delete full.priority;
    return { complaint: full, messages: await publicThread(c.id) };
  })
);

router.post(
  '/t/:ticket/reply',
  lookupLimiter,
  optionalAuth,
  wrap(async (req) => {
    const c = await ownTicket(req);
    const message = String(req.body?.message || '').trim();
    const bad = firstError([['text', message, 'Message', { min: 2, max: 2000 }]]);
    if (bad) throw fail(bad);
    if (c.status === 'closed') throw fail('This complaint is closed. Please raise a new complaint if the problem continues.');
    const count = (await query("SELECT COUNT(*)::int AS n FROM complaint_messages WHERE complaint_id = $1 AND author_type = 'customer'", [c.id])).rows[0].n;
    if (count >= 30) throw fail('This ticket has reached its message limit. Please raise a new complaint.');
    await query("INSERT INTO complaint_messages (complaint_id, author_type, author_id, author_name, body) VALUES ($1,'customer',$2,$3,$4)", [c.id, req.user?.id || null, c.name, message]);
    // A customer reply reopens a resolved ticket and tells staff the ball is back in their court
    const next = ['resolved', 'waiting_customer'].includes(c.status) ? 'open' : c.status;
    await query('UPDATE complaints SET status = $2, updated_at = NOW() WHERE id = $1', [c.id, next]);
    return { status: next, messages: await publicThread(c.id) };
  })
);

// ---------------------------------------------------------------- staff side

const staff = Router();
staff.use(requirePermission('support'));
staff.param('id', (req, res, next, id) => (/^[0-9]{1,9}$/.test(id) ? next() : res.status(404).json({ success: false, error: 'Complaint not found' })));

const audit = (req, action, id) =>
  query('INSERT INTO audit_log(actor_id,actor_name,action,entity_id) VALUES($1,$2,$3,$4)', [req.user.id, req.user.name, action, String(id)]).catch(console.error);

async function counts() {
  const { rows } = await query('SELECT status, COUNT(*)::int AS n FROM complaints GROUP BY status');
  const out = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of rows) out[r.status] = r.n;
  return out;
}

staff.get(
  '/counts',
  wrap(async () => {
    const c = await counts();
    return { counts: c, attention: c.open };
  })
);

staff.get(
  '/',
  wrap(async (req) => {
    const status = String(req.query.status || '');
    const category = String(req.query.category || '');
    const q = String(req.query.q || '').trim().slice(0, 80);
    const page = Math.max(1, Number(req.query.page) || 1);
    const where = [];
    const params = [];
    if (STATUSES.includes(status)) { params.push(status); where.push(`c.status = $${params.length}`); }
    else if (status === 'active') where.push("c.status IN ('open','in_progress','waiting_customer')");
    if (CATEGORIES[category]) { params.push(category); where.push(`c.category = $${params.length}`); }
    if (q) {
      params.push('%' + q.replace(/[%_\\]/g, (m) => '\\' + m) + '%');
      where.push(`(c.ticket ILIKE $${params.length} OR c.subject ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.order_number ILIKE $${params.length})`);
    }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = (await query(`SELECT COUNT(*)::int AS n FROM complaints c ${w}`, params)).rows[0].n;
    const { rows } = await query(
      `SELECT c.*, u.name AS assigned_name FROM complaints c LEFT JOIN users u ON u.id = c.assigned_to ${w}
        ORDER BY (c.status IN ('open','in_progress','waiting_customer')) DESC,
                 CASE c.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, c.updated_at DESC
        LIMIT 25 OFFSET ${(page - 1) * 25}`,
      params
    );
    return { complaints: rows.map(mapComplaint), counts: await counts(), total, page, pages: Math.max(1, Math.ceil(total / 25)) };
  })
);

staff.get(
  '/:id',
  wrap(async (req) => {
    const { rows } = await query('SELECT c.*, u.name AS assigned_name FROM complaints c LEFT JOIN users u ON u.id = c.assigned_to WHERE c.id = $1', [req.params.id]);
    if (!rows[0]) throw fail('Complaint not found', 404);
    const msgs = await query('SELECT * FROM complaint_messages WHERE complaint_id = $1 ORDER BY created_at, id', [req.params.id]);
    let order = null;
    if (rows[0].order_number) {
      const o = await query('SELECT order_number, status, total, payment_method, created_at FROM orders WHERE upper(order_number) = $1 LIMIT 1', [rows[0].order_number]);
      order = o.rows[0] ? { orderNumber: o.rows[0].order_number, status: o.rows[0].status, total: Number(o.rows[0].total), paymentMethod: o.rows[0].payment_method, placedAt: o.rows[0].created_at } : null;
    }
    return { complaint: mapComplaint(rows[0]), messages: msgs.rows.map(mapMessage), order };
  })
);

staff.post(
  '/:id/reply',
  wrap(async (req) => {
    const body = String(req.body?.body || '').trim();
    const isNote = req.body?.visibility === 'note';
    const bad = firstError([['text', body, isNote ? 'Note' : 'Reply', { min: 2, max: 2000 }]]);
    if (bad) throw fail(bad);
    const { rows } = await query('SELECT * FROM complaints WHERE id = $1', [req.params.id]);
    const c = rows[0];
    if (!c) throw fail('Complaint not found', 404);
    await query('INSERT INTO complaint_messages (complaint_id, author_type, author_id, author_name, body) VALUES ($1,$2,$3,$4,$5)', [c.id, isNote ? 'note' : 'staff', req.user.id, req.user.name, body]);
    if (!isNote) {
      // Answering an untouched ticket moves it along; the customer is told by email.
      if (c.status === 'open') await query("UPDATE complaints SET status = 'in_progress', updated_at = NOW() WHERE id = $1", [c.id]);
      else await query('UPDATE complaints SET updated_at = NOW() WHERE id = $1', [c.id]);
      void complaintReplyEmail(c, body, req.user.name);
    }
    void audit(req, isNote ? 'COMPLAINT note ' + c.ticket : 'COMPLAINT reply ' + c.ticket, c.id);
    const msgs = await query('SELECT * FROM complaint_messages WHERE complaint_id = $1 ORDER BY created_at, id', [c.id]);
    return { messages: msgs.rows.map(mapMessage) };
  })
);

staff.patch(
  '/:id',
  wrap(async (req) => {
    const { rows } = await query('SELECT * FROM complaints WHERE id = $1', [req.params.id]);
    const c = rows[0];
    if (!c) throw fail('Complaint not found', 404);
    const b = req.body || {};
    const sets = [];
    const params = [c.id];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    let resolved = false;
    if (b.priority !== undefined) {
      if (!PRIORITIES.includes(b.priority)) throw fail('Invalid priority');
      add('priority', b.priority);
    }
    if (b.assign !== undefined) add('assigned_to', b.assign === 'me' ? req.user.id : null);
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) throw fail('Invalid status');
      add('status', b.status);
      if (b.status === 'resolved' || b.status === 'closed') {
        const resolution = String(b.resolution ?? c.resolution ?? '').trim();
        if (b.status === 'resolved' && resolution.length < 10) throw fail('Describe how it was resolved (at least 10 characters) so the customer knows');
        if (resolution.length > 2000) throw fail('Resolution note is too long');
        if (resolution) add('resolution', resolution);
        if (c.status !== 'resolved' && c.status !== 'closed') { add('resolved_at', new Date()); add('resolved_by', req.user.id); }
        resolved = b.status === 'resolved' && c.status !== 'resolved';
      } else if (['resolved', 'closed'].includes(c.status)) {
        // Reopening clears the resolution stamp but keeps the note for history
        sets.push('resolved_at = NULL');
      }
    }
    if (!sets.length) throw fail('Nothing to update');
    sets.push('updated_at = NOW()');
    const upd = await query(`UPDATE complaints SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
    if (resolved) void complaintResolvedEmail(upd.rows[0]);
    void audit(req, 'COMPLAINT update ' + c.ticket + ' ' + JSON.stringify({ status: b.status, priority: b.priority, assign: b.assign }), c.id);
    return { complaint: mapComplaint(upd.rows[0]) };
  })
);

router.use('/admin', staff);

export default router;
