import { useEffect, useState } from 'react';
import { askText, confirmAction } from '../components/Dialogs';
import { Link } from 'react-router-dom';
import api from '../api/client';
type Row = Record<string, unknown>;
type Result = { rows?: Row[]; refunds?: Row[]; attempts?: Row[]; transactions?: Row[]; trend?: Row[]; bestsellers?: Row[]; stats?: Row; orders?: Row[]; notes?: Row[] } & Record<string, unknown>;
const value = (v: unknown) => v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
function Table({ rows = [], actions }: { rows?: Row[]; actions?: (row: Row) => React.ReactNode }) {
  if (!rows.length) return <p className="muted">No records found.</p>;
  const keys = Object.keys(rows[0]).filter(k => !['payload', 'quote', 'razorpay_payment_id'].includes(k));
  return <div className="ops-table"><table className="erp-table"><thead><tr>{keys.map(k => <th key={k}>{k.replaceAll('_', ' ')}</th>)}{actions && <th>Actions</th>}</tr></thead><tbody>{rows.map((r, i) => <tr key={String(r.id ?? i)}>{keys.map(k => <td key={k}>{value(r[k])}</td>)}{actions && <td>{actions(r)}</td>}</tr>)}</tbody></table></div>;
}
export default function AdminOperations({ section }: { section: string }) {
  const [data, setData] = useState<Result>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [detail, setDetail] = useState<Result | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [cases,setCases]=useState<Row[]>([]);
  const [history, setHistory] = useState<Row[]>([]);
  async function load() {
    setBusy(true); setError('');
    try { const r = await api.get('/operations/' + section, { params: { page, q, from, to, low: section === 'inventory' ? 'true' : undefined } }); setData(r.data); if(section==='returns'){const returns=await api.get('/returns/admin');setCases(returns.data.rows);} }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  useEffect(() => { setDetail(null); void load(); }, [section, page]);
  async function act(path: string, body: Row = {}, method = 'post') {
    setBusy(true); setError(''); setNotice('');
    try { const r = await api.request({ url: '/operations/' + path, method, data: body }); if (r.data?.error) throw new Error(r.data.error); setNotice('Saved successfully.'); await load(); return true; }
    catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); }
  }
  function form(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); return Object.fromEntries(new FormData(e.currentTarget).entries()); }
  async function customer(id: string) { try { const r = await api.get('/operations/customers/' + id); setDetail(r.data); setCustomerId(id); } catch (e) { setError((e as Error).message); } }
  const button = (label: string, fn: () => void) => <button type="button" className="erp-btn" disabled={busy} onClick={fn}>{label}</button>;
  return <div className="ops-stack">
    <div className="erp-card ops-panel"><div className="erp-toolbar">
      <input aria-label="Search records" placeholder="Search name or code" value={q} onChange={e => setQ(e.target.value)} />
      {section === 'reports' && <><label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></>}
      {button(busy ? 'Loading…' : 'Refresh', () => void load())}
    </div>
    {error && <p role="alert" className="erp-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {section === 'settings' && <form className="ops-form" onSubmit={e => { const f = form(e); void act('settings', { ...f, restrictedCoverage: f.restrictedCoverage === 'on' }, 'put'); }}>
      {['shippingFee', 'freeShippingThreshold', 'returnDays', 'lowStockThreshold'].map(k => <label key={k}>{k.replace(/([A-Z])/g, ' $1')}<input key={String(data[k])} name={k} type="number" min="0" step={k.includes('Fee') || k.includes('Shipping') ? '0.01' : '1'} required defaultValue={String(data[k] ?? '')} /></label>)}
      <label><input name="restrictedCoverage" type="checkbox" key={String(data.restrictedCoverage)} defaultChecked={!!data.restrictedCoverage} /> Deliver only to configured pincodes</label><button className="erp-btn primary" disabled={busy}>Save settings</button>
    </form>}
    {section === 'inventory' && <><h2>Low stock</h2><form className="ops-form" onSubmit={e => void act('inventory/adjust', form(e))}>
      <label>Product ID<input name="bookId" type="number" required /></label><label>Quantity adjustment<input name="delta" type="number" required placeholder="10 or -2" /></label><label>Reason<input name="reason" required /></label><button className="erp-btn primary" disabled={busy}>Adjust stock</button>
    </form>{button('Load stock history', () => { api.get('/operations/inventory/history').then(r => setHistory(r.data.rows)).catch(e => setError(e.message)); })}</>}
    {section === 'payments' && <><h2>Issue a refund</h2><p>Refunds stay pending until the gateway confirms them. For COD, record completion only after returning the money.</p><form className="ops-form" onSubmit={e => void act('payments/refund', form(e))}>
      <label>Order number<input name="order" required /></label><label>Amount ₹<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Reason<input name="reason" required /></label><button className="erp-btn primary" disabled={busy}>Request refund</button>
    </form><h2>Refund history</h2><Table rows={data.refunds} actions={r => r.status !== 'completed' ? button(r.razorpay_payment_id ? 'Retry / check gateway' : 'Confirm money returned', async () => { if (r.razorpay_payment_id || await confirmAction('Confirm you have returned this amount to the customer?')) void act(`payments/refunds/${r.id}/retry`, { manual: !r.razorpay_payment_id }); }) : null} />
      <h2>Payment reconciliation</h2><Table rows={data.attempts} actions={r => !r.order_id ? <>{button('Recover order', () => void act(`payments/attempts/${r.id}/recover`))}{r.payment_id && !['refunded','refund_pending'].includes(String(r.status)) ? button('Refund unfulfilled payment',async()=>{if(await confirmAction('Refund this captured payment instead of fulfilling the order?'))void act(`payments/attempts/${r.id}/refund`);}) : null}</> : <Link to="/admin/orders">View orders</Link>} /></>}
    {section === 'returns' && <><h2>Item returns</h2><Table rows={cases} actions={r=><>{(r.status==='requested'?['approve','decline']:r.status==='approved'?['receive']:[]).map(action=><span key={action}>{button(action,()=>{void askText({title:action==='receive'?'Record inspection':action==='approve'?'Approve return':'Decline return',label:action==='receive'?'Inspection outcome':'Pickup reference or decision note',multiline:true,confirmText:'Save'}).then(note=>{if(note)api.post('/returns/admin/'+r.id,{action,note}).then(()=>load()).catch(e=>setError(e.message));});})}</span>)}</>} /><h2>Whole-order returns</h2><p>Approve a request, arrange pickup, then record inspection before marking it returned. Stock and refund records are updated together.</p><Table rows={data.rows} actions={r => <>{(r.status === 'return_requested' ? [['Approve pickup', 'return_approved'], ['Decline', 'delivered']] : r.status === 'return_approved' ? [['Received and inspected', 'returned']] : []).map(([label, status]) => <span key={status}>{button(label, () => { void askText({ title: label, label: 'Decision / pickup / inspection note', multiline: true, confirmText: 'Save' }).then(note => { if (note) void act(`returns/${r.id}`, { status, note }); }); })}</span>)}</>} /></>}
    {section === 'reports' && <><div className="erp-stats">{Object.entries(data.stats || {}).map(([k, v]) => <div className="erp-stat" key={k}><strong>{value(v)}</strong><span>{k.replaceAll('_', ' ')}</span></div>)}</div><h2>Daily order value</h2><Table rows={data.trend} /><h2>Best sellers</h2><Table rows={data.bestsellers} /><a className="erp-btn" href={`/api/operations/orders/export?from=${from}&to=${to}`}>Export orders CSV</a></>}
    {!['payments', 'returns', 'reports', 'settings', 'products'].includes(section) && <Table rows={data.rows} actions={section === 'customers' ? r => button('View customer', () => void customer(String(r.id))) : section === 'emails' ? r => !r.sent ? button('Retry delivery', () => void act(`emails/${r.id}/retry`)) : null : undefined} />}
    {section === 'gifts' && <><h2>Gift-card transactions</h2><Table rows={data.transactions} /></>}
    {section === 'products' && <><h2>Catalogue tools</h2><p>Export the CSV as a template. Keep IDs to update products; leave IDs empty to create products. Imports are validated together before saving.</p><a className="erp-btn" href="/api/operations/products/export">Export products CSV</a>
      <label>Import CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={async e => { const file = e.target.files?.[0]; if (file && await confirmAction('Import this CSV and update the listed products?')) await act('products/import', { csv: await file.text() }); }} /></label>
      <form className="ops-form" onSubmit={e => { const f = form(e); void act('products/bulk', { ...f, ids: String(f.ids).split(',').map(Number) }); }}><label>Product IDs, comma separated<input name="ids" required /></label><label>Action<select name="action"><option value="publish">Publish</option><option value="hide">Hide</option><option value="price">Set sale price</option><option value="category">Add category</option></select></label><label>Price or category ID<input name="value" type="number" min="0" /></label><button className="erp-btn primary" disabled={busy}>Apply bulk update</button></form></>}
    {!['settings', 'payments', 'products', 'reports', 'returns', 'gifts'].includes(section) && <div className="erp-toolbar">{button('Previous', () => setPage(p => Math.max(1, p - 1)))}<span>Page {page}</span>{button('Next', () => setPage(p => p + 1))}</div>}
    </div>
    {history.length > 0 && <div className="erp-card ops-panel"><h2>Stock movement history</h2><Table rows={history} /></div>}
    {detail && <div className="erp-card ops-panel"><h2>Customer history</h2><Table rows={detail.orders} /><h3>Internal notes</h3><Table rows={detail.notes} /><form className="ops-form" onSubmit={async e => { if (await act(`customers/${customerId}/notes`, form(e))) await customer(customerId); }}><label>Note<textarea name="note" required maxLength={2000} /></label><button className="erp-btn primary">Add internal note</button></form></div>}
    {section === 'settings' && <div className="erp-card ops-panel"><h2>Delivery coverage</h2><form className="ops-form" onSubmit={e => void act('settings/pincodes', form(e), 'put')}>
      {['pincode', 'city', 'state', 'shipping', 'etaDays'].map(k => <label key={k}>{k}<input name={k} required type={['shipping', 'etaDays'].includes(k) ? 'number' : 'text'} min="0" /></label>)}<button className="erp-btn primary">Save pincode</button></form>{button('Show delivery pincodes', () => { api.get('/operations/settings/pincodes').then(r => setHistory(r.data.rows)).catch(e => setError(e.message)); })}</div>}
  </div>;
}
