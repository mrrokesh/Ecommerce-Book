/** Who created / last edited a product, and whether it came from Rokesh ERP. */

export function actorRole(user) {
  if (!user) return 'system';
  if (user.role === 'admin') return 'admin';
  if (user.role === 'staff') return 'staff';
  return 'manual';
}

export function actorLabel(user) {
  if (!user) return 'System';
  const name = String(user.name || user.email || 'Staff').trim();
  const role = user.role === 'admin' ? 'Admin' : user.role === 'staff' ? 'Staff' : 'User';
  return `${name} (${role})`;
}

/** Safe ERP fingerprint — host + masked key prefix only, never the secret. */
export function erpSourceLabel(origin, apiKey) {
  let host = 'rokesh-erp';
  try {
    host = new URL(String(origin || '').replace(/\/mcp$/i, '')).host || host;
  } catch {
    host = String(origin || host).replace(/^https?:\/\//, '').split('/')[0] || host;
  }
  const key = String(apiKey || '').trim();
  const tip = key.length >= 12 ? `${key.slice(0, 8)}…${key.slice(-4)}` : key ? 'key-set' : 'no-key';
  return `Rokesh ERP · ${host} · ${tip}`;
}

export function createProvenance(user) {
  return {
    source: actorRole(user),
    sourceLabel: actorLabel(user),
    createdBy: user?.id || null,
    createdByName: actorLabel(user),
    updatedBy: user?.id || null,
    updatedByName: actorLabel(user),
  };
}

export function editProvenance(user) {
  return {
    updatedBy: user?.id || null,
    updatedByName: actorLabel(user),
  };
}

export function erpProvenance(user, origin, apiKey) {
  const label = erpSourceLabel(origin, apiKey);
  const syncedBy = user ? ` · synced by ${actorLabel(user)}` : '';
  return {
    source: 'erp',
    sourceLabel: `${label}${syncedBy}`,
    updatedBy: user?.id || null,
    updatedByName: user ? `ERP sync · ${actorLabel(user)}` : 'ERP sync (automatic)',
  };
}
