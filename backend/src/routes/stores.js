import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const pincode = String(req.query.pincode || '').trim();
    const { rows } = await query(
      `SELECT id, name, address, city, pincode, phone, hours, lat, lng FROM stores ORDER BY id`
    );
    let stores = rows.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      city: s.city,
      pincode: s.pincode,
      phone: s.phone,
      hours: s.hours,
      lat: s.lat ? Number(s.lat) : null,
      lng: s.lng ? Number(s.lng) : null,
    }));
    if (/^\d{6}$/.test(pincode)) {
      const prefix = pincode.slice(0, 3);
      stores = stores.map((s) => ({
        ...s,
        inStock: s.pincode.startsWith(prefix) || s.pincode === pincode,
      }));
    }
    return res.json({ success: true, data: { stores } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch stores' });
  }
});

router.get('/availability', async (req, res) => {
  try {
    const bookId = Number(req.query.bookId);
    const pincode = String(req.query.pincode || '').trim();
    const { rows } = await query(
      `SELECT id, name, address, city, pincode, phone, hours FROM stores ORDER BY id`
    );
    const stores = rows.map((s) => {
      const nearby = !pincode || s.pincode === pincode || s.pincode.slice(0, 3) === pincode.slice(0, 3);
      return {
        id: s.id,
        name: s.name,
        address: s.address,
        city: s.city,
        pincode: s.pincode,
        phone: s.phone,
        hours: s.hours,
        available: nearby && Number.isFinite(bookId),
      };
    });
    return res.json({ success: true, data: { stores } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to check availability' });
  }
});

export default router;
