import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

router.get('/:pin', async (req, res) => {
  try {
    const pin = String(req.params.pin || '').replace(/\D/g, '');
    if (pin.length !== 6) {
      return res.status(400).json({ success: false, error: 'Enter a valid 6-digit pincode' });
    }
    const { rows } = await query(`SELECT * FROM pincodes WHERE pincode = $1`, [pin]);
    if (rows[0]) {
      const p = rows[0];
      return res.json({
        success: true,
        data: {
          serviceable: true,
          pincode: p.pincode,
          city: p.city,
          state: p.state,
          express: p.express,
          etaDays: p.eta_days,
          shipping: Number(p.shipping),
          message: p.express
            ? `Express delivery to ${p.city} in ${p.eta_days} day${p.eta_days > 1 ? 's' : ''}`
            : `Standard delivery to ${p.city} in ${p.eta_days} days`,
        },
      });
    }
    const prefix = pin.slice(0, 3);
    const eta = prefix === '636' ? 1 : prefix === '637' || prefix === '638' ? 2 : 5;
    const express = eta <= 2;
    return res.json({
      success: true,
      data: {
        serviceable: true,
        pincode: pin,
        city: express ? 'Tamil Nadu' : 'India',
        state: 'India',
        express,
        etaDays: eta,
        shipping: eta <= 1 ? 0 : eta <= 2 ? 30 : 49,
        message: express
          ? `Express delivery available for ${pin}`
          : `Standard delivery available for ${pin} in about ${eta} days`,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Pincode check failed' });
  }
});

export default router;
