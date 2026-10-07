import { Router } from 'express';
import {
  listShippingConfig,
  updateShippingSettings,
  updatePartner,
  ensureShippingTables,
} from '../shipping/index.js';
import { shipOrder, applyTrackingWebhook } from '../shipping/service.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/admin/config', requireAdmin, async (_req, res) => {
  try {
    const data = await listShippingConfig();
    return res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to load shipping config' });
  }
});

router.put('/admin/settings', requireAdmin, async (req, res) => {
  try {
    const data = await updateShippingSettings(req.body || {});
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/admin/partners/:code', requireAdmin, async (req, res) => {
  try {
    const data = await updatePartner(req.params.code, req.body || {});
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/admin/orders/:id/ship', requireAdmin, async (req, res) => {
  try {
    const out = await shipOrder(req.params.id, req.body || {});
    return res.json({ success: true, data: out });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ success: false, error: err.message || 'Ship failed' });
  }
});

/** Public carrier webhooks — protect with SHIPPING_WEBHOOK_SECRET query/header when set. */
router.post('/webhooks/:carrier', async (req, res) => {
  try {
    const secret = process.env.SHIPPING_WEBHOOK_SECRET;
    if (secret) {
      const got = req.get('x-webhook-secret') || req.query.secret;
      if (got !== secret) return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const carrier = req.params.carrier;
    const b = req.body || {};
    const awb =
      b.awb ||
      b.awb_code ||
      b.waybill ||
      b.AWBNo ||
      b.data?.awb ||
      b.shipment?.awb ||
      null;
    const status =
      b.status ||
      b.current_status ||
      b.shipment_status ||
      b.data?.status ||
      'shipped';
    const trackingUrl = b.tracking_url || b.trackingUrl || null;
    const data = await applyTrackingWebhook({
      carrier,
      awb: String(awb || ''),
      status: String(status),
      note: b.note || b.scan || null,
      trackingUrl,
    });
    return res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/bootstrap', requireAdmin, async (_req, res) => {
  await ensureShippingTables();
  return res.json({ success: true, data: await listShippingConfig() });
});

export default router;
