function money(n) {
  return `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
}

/** HTML invoice printable as PDF from the browser (no native pdf binary required on Render). */
export function renderInvoiceHtml(order, items = []) {
  const gstin = process.env.GSTIN || 'GSTIN-NOT-SET';
  const business = process.env.BUSINESS_NAME || 'Salem Book House';
  const address = process.env.BUSINESS_ADDRESS || 'Salem, Tamil Nadu, India';
  const hsn = process.env.DEFAULT_HSN || '4901';
  const inv = order.invoice_number || order.order_number;
  const taxable = Number(order.subtotal) - Number(order.discount || 0);
  // Books often nil/0 GST; when GST_RATE set, show inclusive split for transparency.
  const rate = Number(process.env.GST_RATE || 0);
  const tax = rate > 0 ? (taxable * rate) / (100 + rate) : 0;
  const base = taxable - tax;
  const cgst = tax / 2;
  const sgst = tax / 2;
  const rows = items
    .map(
      (it) => `<tr>
      <td>${escapeHtml(it.title)}</td>
      <td>${hsn}</td>
      <td>${it.quantity}</td>
      <td>${money(it.unit_price)}</td>
      <td>${money(it.line_total)}</td>
    </tr>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${inv}</title>
  <style>
    body{font-family:Georgia,serif;margin:32px;color:#1a1a1a}
    h1{font-size:22px;margin:0} table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:14px}
    .meta{margin-top:12px;font-size:14px;line-height:1.5}
    .right{text-align:right}
  </style></head><body>
  <h1>${escapeHtml(business)}</h1>
  <div class="meta">${escapeHtml(address)}<br/>GSTIN: ${escapeHtml(gstin)}<br/>
  Invoice: <strong>${escapeHtml(inv)}</strong> · Order: ${escapeHtml(order.order_number)}<br/>
  Date: ${new Date(order.created_at).toLocaleString('en-IN')}
  </div>
  <div class="meta"><strong>Bill to</strong><br/>
  ${escapeHtml(order.shipping_name)} · ${escapeHtml(order.shipping_phone)}<br/>
  ${escapeHtml(order.shipping_address)}
  </div>
  <table><thead><tr><th>Item</th><th>HSN</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="meta right">
    Subtotal: ${money(order.subtotal)}<br/>
    Discount: ${money(order.discount)}<br/>
    ${rate > 0 ? `Taxable: ${money(base)} · CGST: ${money(cgst)} · SGST: ${money(sgst)}<br/>` : 'GST: Inclusive / as applicable<br/>'}
    Shipping: ${money(order.shipping)}<br/>
    <strong>Total: ${money(order.total)}</strong><br/>
    Payment: ${escapeHtml(order.payment_method)} (${escapeHtml(order.payment_status || '')})
  </div>
  <p class="meta">This is a computer-generated invoice from Salem Book House.</p>
  </body></html>`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
