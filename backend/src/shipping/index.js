import { query } from '../db/pool.js';
import { PARTNER_DEFS, partnerDef } from './partners.js';
import * as manual from './adapters/manual.js';
import * as shiprocket from './adapters/shiprocket.js';
import * as delhivery from './adapters/delhivery.js';
import * as shadowfax from './adapters/shadowfax.js';
import * as bluedart from './adapters/bluedart.js';
import * as dtdc from './adapters/dtdc.js';

const ADAPTERS = {
  manual,
  shiprocket,
  delhivery,
  shadowfax,
  bluedart,
  dtdc,
};

function envCreds(code) {
  const upper = code.toUpperCase();
  const map = {
    shiprocket: {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
      channelId: process.env.SHIPROCKET_CHANNEL_ID,
      pickupLocation: process.env.SHIPROCKET_PICKUP_LOCATION,
      pickupPincode: process.env.SHIPROCKET_PICKUP_PINCODE,
    },
    shadowfax: {
      token: process.env.SHADOWFAX_TOKEN,
      clientCode: process.env.SHADOWFAX_CLIENT_CODE,
    },
    bluedart: {
      loginId: process.env.BLUEDART_LOGIN_ID,
      licenseKey: process.env.BLUEDART_LICENSE_KEY,
      apiType: process.env.BLUEDART_API_TYPE,
      customerCode: process.env.BLUEDART_CUSTOMER_CODE,
      endpoint: process.env.BLUEDART_ENDPOINT,
    },
    delhivery: {
      token: process.env.DELHIVERY_TOKEN,
      pickupName: process.env.DELHIVERY_PICKUP_NAME,
    },
    dtdc: {
      apiKey: process.env.DTDC_API_KEY,
      customerCode: process.env.DTDC_CUSTOMER_CODE,
      endpoint: process.env.DTDC_ENDPOINT,
    },
    manual: {},
  };
  const raw = map[code] || {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v != null && String(v).trim() !== '') out[k] = String(v).trim();
  }
  return out;
}

export async function ensureShippingTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS shipping_partners (
      code VARCHAR(40) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await query(`
    CREATE TABLE IF NOT EXISTS shipping_settings (
      id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      auto_create BOOLEAN NOT NULL DEFAULT FALSE,
      default_partner VARCHAR(40) NOT NULL DEFAULT 'manual',
      pickup_pincode VARCHAR(10) DEFAULT '636001',
      pickup_address TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await query(
    `INSERT INTO shipping_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`
  );
  for (const p of PARTNER_DEFS) {
    await query(
      `INSERT INTO shipping_partners (code, name, enabled, is_default)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
      [p.code, p.name, p.code === 'manual', p.code === 'manual']
    );
  }
}

function maskCreds(creds, code) {
  const def = partnerDef(code);
  const out = { ...(creds || {}) };
  for (const f of def?.fields || []) {
    if (f.secret && out[f.key]) out[f.key] = '••••••••';
  }
  return out;
}

export async function listShippingConfig() {
  await ensureShippingTables();
  const settings = (await query(`SELECT * FROM shipping_settings WHERE id = 1`)).rows[0];
  const { rows } = await query(
    `SELECT code, name, enabled, is_default, credentials, updated_at FROM shipping_partners ORDER BY name`
  );
  return {
    settings: {
      autoCreate: settings.auto_create,
      defaultPartner: settings.default_partner,
      pickupPincode: settings.pickup_pincode,
      pickupAddress: settings.pickup_address,
    },
    partners: PARTNER_DEFS.map((def) => {
      const row = rows.find((r) => r.code === def.code) || {};
      const dbCreds = row.credentials || {};
      const merged = { ...envCreds(def.code), ...dbCreds };
      return {
        code: def.code,
        name: def.name,
        docsUrl: def.docsUrl,
        fields: def.fields,
        enabled: Boolean(row.enabled),
        isDefault: Boolean(row.is_default) || settings.default_partner === def.code,
        configured: Object.keys(merged).length > 0 || def.code === 'manual',
        credentials: maskCreds(merged, def.code),
      };
    }),
  };
}

export async function updateShippingSettings(body = {}) {
  await ensureShippingTables();
  const autoCreate = Boolean(body.autoCreate);
  const defaultPartner = String(body.defaultPartner || 'manual');
  if (!partnerDef(defaultPartner)) throw new Error('Unknown default partner');
  await query(
    `UPDATE shipping_settings SET
       auto_create = $1,
       default_partner = $2,
       pickup_pincode = COALESCE($3, pickup_pincode),
       pickup_address = COALESCE($4, pickup_address),
       updated_at = NOW()
     WHERE id = 1`,
    [autoCreate, defaultPartner, body.pickupPincode || null, body.pickupAddress || null]
  );
  await query(`UPDATE shipping_partners SET is_default = (code = $1)`, [defaultPartner]);
  return listShippingConfig();
}

export async function updatePartner(code, body = {}) {
  await ensureShippingTables();
  const def = partnerDef(code);
  if (!def) throw new Error('Unknown partner');
  const existing = (
    await query(`SELECT credentials FROM shipping_partners WHERE code = $1`, [code])
  ).rows[0];
  const prev = existing?.credentials || {};
  const next = { ...prev };
  if (body.credentials && typeof body.credentials === 'object') {
    for (const f of def.fields) {
      if (body.credentials[f.key] == null) continue;
      const val = String(body.credentials[f.key]);
      if (f.secret && (val === '••••••••' || val === '')) continue;
      next[f.key] = val;
    }
    // allow custom keys like endpoint
    for (const [k, v] of Object.entries(body.credentials)) {
      if (def.fields.some((f) => f.key === k)) continue;
      if (String(v) && String(v) !== '••••••••') next[k] = String(v);
    }
  }
  const enabled = body.enabled != null ? Boolean(body.enabled) : undefined;
  await query(
    `UPDATE shipping_partners SET
       credentials = $2::jsonb,
       enabled = COALESCE($3, enabled),
       updated_at = NOW()
     WHERE code = $1`,
    [code, JSON.stringify(next), enabled]
  );
  if (body.setDefault) {
    await updateShippingSettings({
      defaultPartner: code,
      autoCreate: (await listShippingConfig()).settings.autoCreate,
    });
  }
  return listShippingConfig();
}

async function resolvePartner(code) {
  await ensureShippingTables();
  const settings = (await query(`SELECT * FROM shipping_settings WHERE id = 1`)).rows[0];
  const partnerCode = code || settings.default_partner || 'manual';
  const row = (
    await query(`SELECT * FROM shipping_partners WHERE code = $1`, [partnerCode])
  ).rows[0];
  const creds = { ...envCreds(partnerCode), ...(row?.credentials || {}) };
  if (settings.pickup_pincode) creds.pickupPincode = settings.pickup_pincode;
  const adapter = ADAPTERS[partnerCode] || manual;
  return { partnerCode, creds, adapter, settings, enabled: row?.enabled !== false };
}

export async function createShipmentForOrder(order, partnerCode) {
  const { partnerCode: code, creds, adapter } = await resolvePartner(partnerCode);
  const result = await adapter.createShipment(order, creds);
  return { ...result, carrier: result.carrier || code };
}

export async function trackByAwb(awb, partnerCode) {
  const { adapter, creds } = await resolvePartner(partnerCode);
  return adapter.trackShipment(awb, creds);
}

export async function shouldAutoCreate() {
  await ensureShippingTables();
  const { rows } = await query(`SELECT auto_create, default_partner FROM shipping_settings WHERE id = 1`);
  return rows[0] || { auto_create: false, default_partner: 'manual' };
}

export { PARTNER_DEFS };
