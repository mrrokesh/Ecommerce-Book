import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function mapAddr(a) {
  return {
    id: a.id,
    fullName: a.full_name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    isDefault: a.is_default,
  };
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, full_name`,
      [req.user.id]
    );
    return res.json({ success: true, data: { addresses: rows.map(mapAddr) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch addresses' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { fullName, phone, line1, line2, city, state, pincode, isDefault } = req.body || {};
    if (!fullName?.trim() || !phone?.trim() || !line1?.trim() || !pincode?.trim()) {
      return res.status(400).json({ success: false, error: 'Name, phone, address and pincode are required' });
    }
    if (isDefault) {
      await query(`UPDATE addresses SET is_default = FALSE WHERE user_id = $1`, [req.user.id]);
    }
    const { rows } = await query(
      `INSERT INTO addresses (user_id, full_name, phone, line1, line2, city, state, pincode, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        req.user.id,
        fullName.trim(),
        phone.trim(),
        line1.trim(),
        line2 || null,
        city || 'Salem',
        state || 'Tamil Nadu',
        pincode.trim(),
        Boolean(isDefault),
      ]
    );
    return res.status(201).json({ success: true, data: { address: mapAddr(rows[0]) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to save address' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query(`DELETE FROM addresses WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
    return res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to delete address' });
  }
});

export default router;
