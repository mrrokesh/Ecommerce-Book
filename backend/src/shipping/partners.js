/** Built-in delivery partner catalog. Credentials live in env / admin settings, never hardcoded secrets. */
export const PARTNER_DEFS = [
  {
    code: 'shiprocket',
    name: 'Shiprocket',
    fields: [
      { key: 'email', label: 'API email', secret: false },
      { key: 'password', label: 'API password', secret: true },
      { key: 'channelId', label: 'Channel ID', secret: false },
    ],
    docsUrl: 'https://apidocs.shiprocket.in/',
  },
  {
    code: 'shadowfax',
    name: 'Shadowfax',
    fields: [
      { key: 'token', label: 'API token', secret: true },
      { key: 'clientCode', label: 'Client code', secret: false },
    ],
    docsUrl: 'https://shadowfax.in/',
  },
  {
    code: 'bluedart',
    name: 'BlueDart',
    fields: [
      { key: 'loginId', label: 'Login ID', secret: false },
      { key: 'licenseKey', label: 'License key', secret: true },
      { key: 'apiType', label: 'API type (S/E)', secret: false },
      { key: 'customerCode', label: 'Customer code', secret: false },
    ],
    docsUrl: 'https://www.bluedart.com/',
  },
  {
    code: 'delhivery',
    name: 'Delhivery',
    fields: [
      { key: 'token', label: 'API token', secret: true },
      { key: 'pickupName', label: 'Pickup warehouse name', secret: false },
    ],
    docsUrl: 'https://delhivery.com/',
  },
  {
    code: 'dtdc',
    name: 'DTDC',
    fields: [
      { key: 'customerCode', label: 'Customer code', secret: false },
      { key: 'apiKey', label: 'API key', secret: true },
    ],
    docsUrl: 'https://www.dtdc.in/',
  },
  {
    code: 'manual',
    name: 'Manual (AWB entered by staff)',
    fields: [],
    docsUrl: null,
  },
];

export function partnerDef(code) {
  return PARTNER_DEFS.find((p) => p.code === code) || null;
}
