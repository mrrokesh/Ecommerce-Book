const DEFAULT_ORIGIN = 'https://muruga-api-bjmm.onrender.com';

function erpConfig() {
  const raw = (process.env.ERP_API_URL || process.env.ERP_MCP_URL || DEFAULT_ORIGIN).replace(/\/$/, '');
  const origin = raw.replace(/\/mcp$/i, '') || DEFAULT_ORIGIN;
  const mcpUrl = `${origin}/mcp`;
  const storeUrl = `${origin}/api/store/products`;
  const apiKey = (process.env.ERP_API_KEY || process.env.ERP_MCP_KEY || '').trim();
  return { origin, mcpUrl, storeUrl, apiKey };
}

function parseRpc(text) {
  const raw = String(text || '').trim();
  if (!raw) return {};
  if (raw.startsWith('{')) return JSON.parse(raw);
  const dataLines = raw.split('\n').filter((l) => l.startsWith('data:'));
  if (dataLines.length) {
    return JSON.parse(dataLines[dataLines.length - 1].slice(5).trim());
  }
  return JSON.parse(raw);
}

async function mcpRpc(session, method, params, id = 1) {
  const { mcpUrl, apiKey } = erpConfig();
  if (!apiKey) {
    throw new Error('ERP_API_KEY is not set');
  }
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${apiKey}`,
    'Mcp-Protocol-Version': '2024-11-05',
  };
  if (session) headers['Mcp-Session-Id'] = session;
  let res;
  try {
    res = await fetch(mcpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      // Render free instances can take ~60s to wake; never hang the admin request forever.
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError') throw new Error('ERP did not respond within 90s. Try again in a minute.');
    throw new Error(`Could not reach ERP at ${mcpUrl}: ${err?.message || err}`);
  }
  const text = await res.text();
  const nextSession = res.headers.get('mcp-session-id') || session;
  if (res.status === 401 || res.status === 403) {
    throw new Error('ERP MCP rejected the API key. Generate a new key in ERP → /settings/mcp and paste it into ERP_API_KEY.');
  }
  if (!res.ok) {
    throw new Error(`ERP MCP HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  const body = parseRpc(text);
  if (body.error) {
    throw new Error(body.error.message || 'ERP MCP error');
  }
  return { session: nextSession, result: body.result };
}

// JSON-RPC notifications carry no id and get no response body.
async function mcpNotify(session, method) {
  const { mcpUrl, apiKey } = erpConfig();
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${apiKey}`,
    'Mcp-Protocol-Version': '2024-11-05',
  };
  if (session) headers['Mcp-Session-Id'] = session;
  try {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method }),
      signal: AbortSignal.timeout(15_000),
    });
    await res.body?.cancel();
  } catch {
    /* notifications are best-effort */
  }
}

export function isErpConfigured() {
  return Boolean(erpConfig().apiKey);
}

export async function listErpTools() {
  const init = await mcpRpc(null, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'salem-book-house', version: '1.0.0' },
  });
  await mcpNotify(init.session, 'notifications/initialized');
  const listed = await mcpRpc(init.session, 'tools/list', {}, 3);
  const tools = listed.result?.tools || listed.result || [];
  return { session: listed.session || init.session, tools: Array.isArray(tools) ? tools : [] };
}

export async function callErpTool(session, name, args = {}, id = 10) {
  const out = await mcpRpc(session, 'tools/call', { name, arguments: args }, id);
  return out.result;
}

function parseToolText(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.items)) return result.items;
  if (Array.isArray(result.products)) return result.products;
  if (Array.isArray(result.content)) {
    const texts = result.content.filter((c) => c.type === 'text').map((c) => c.text);
    for (const t of texts) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed.products)) return parsed.products;
        if (Array.isArray(parsed.items)) return parsed.items;
        if (Array.isArray(parsed.data)) return parsed.data;
      } catch {
        /* not json */
      }
    }
  }
  if (Array.isArray(result.data)) return result.data;
  return [];
}

export async function fetchErpProducts() {
  const store = await fetchStoreProducts();
  if (store.products.length || store.ok) {
    return { tool: 'GET /api/store/products', tools: ['store-products'], products: store.products };
  }
  const { session, tools } = await listErpTools();
  const names = tools.map((t) => t.name || t);
  const preferred =
    names.find((n) => /product/i.test(n) && /list|search|get|fetch/i.test(n)) ||
    names.find((n) => /product/i.test(n));
  if (!preferred) {
    throw new Error(`ERP connected but no product tool found. Tools: ${names.join(', ') || '(none)'}`);
  }
  const result = await callErpTool(session, preferred, { limit: 500, page: 1, pageSize: 500 });
  const products = parseToolText(result);
  return { tool: preferred, tools: names, products };
}

async function fetchStoreProducts() {
  const { storeUrl, apiKey } = erpConfig();
  if (!apiKey) throw new Error('ERP_API_KEY is not set');
  const products = [];
  let page = 1;
  let pages = 1;
  do {
    const url = new URL(storeUrl);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', '100');
    let res;
    try {
      res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'X-Api-Key': apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      if (err?.name === 'TimeoutError') throw new Error('ERP store API did not respond within 90s. Try again in a minute.');
      throw new Error(`Could not reach ERP store API: ${err?.message || err}`);
    }
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error('ERP rejected the store API key. Use an mrerp_ key from ERP store settings in ERP_API_KEY.');
    }
    if (!res.ok) {
      throw new Error(`ERP store HTTP ${res.status}: ${text.slice(0, 240)}`);
    }
    let body = {};
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error('ERP store returned non-JSON');
    }
    const batch = Array.isArray(body.products)
      ? body.products
      : Array.isArray(body.data)
        ? body.data
        : Array.isArray(body.items)
          ? body.items
          : [];
    products.push(...batch);
    pages = Number(body.pages) || 1;
    page += 1;
  } while (page <= pages && page <= 50);
  return { ok: true, products };
}
