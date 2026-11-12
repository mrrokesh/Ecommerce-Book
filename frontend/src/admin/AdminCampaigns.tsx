import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api/client';
import { confirmAction } from '../components/Dialogs';

type Campaign = {
  id: number; name: string; subject: string; preheader?: string; headline: string; body: string;
  coupon_code?: string; cta_label: string; cta_url: string; status: string; recipients: number;
  queued: number; delivered: number; failed: number; created_at: string; sent_at?: string;
};
type Overview = { campaigns: Campaign[]; subscribers: number; coupons: { code: string; description?: string }[]; dailyCap: number; sentToday: number };

type Person = { email: string; name?: string; active: boolean };

const blank = { id: 0, name: '', subject: '', preheader: '', headline: '', body: '', couponCode: '', ctaLabel: 'Shop the sale', ctaUrl: '/shop/books' };

/** Ready-made seasonal copy. One offer, one deadline, one button reads best. */
const PRESETS: { label: string; fill: Partial<typeof blank> }[] = [
  { label: 'Diwali sale', fill: { name: 'Diwali sale', subject: 'Diwali sale is on: festive reads for less', preheader: 'Up to 25% off books, gifts and gift cards this week only.', headline: 'Happy Diwali from Salem Book House!', body: 'Light up the festival with a good book. Our Diwali sale is on now, with festive savings across fiction, Tamil literature, exam guides and gift cards.\n\nThe offer ends this Sunday, so pick your favourites today.' } },
  { label: 'Pongal offer', fill: { name: 'Pongal offer', subject: 'Pongal special: save on Tamil books', preheader: 'Celebrate the harvest festival with a great read.', headline: 'Pongal Vazthukkal!', body: 'Celebrate Pongal with a book you will love. Enjoy a special offer on Tamil classics, children\'s stories and family favourites.\n\nOffer valid until the end of the festival week.' } },
  { label: 'Flash sale', fill: { name: 'Flash sale', subject: 'Flash sale: 24 hours only', preheader: 'Extra savings on top books. Ends tonight.', headline: 'Flash sale - 24 hours only', body: 'For the next 24 hours, enjoy a special discount on our best-selling books.\n\nWhen the clock runs out, the offer ends, so do not wait.' } },
  { label: 'Back to school', fill: { name: 'Back to school', subject: 'Back to school: textbooks and guides', preheader: 'Everything for the new term, delivered fast.', headline: 'Back to school, sorted', body: 'Get ready for the new term with study guides, workbooks and stationery-friendly reads.\n\nOrder this week and we will deliver quickly across Salem and beyond.' } },
  { label: 'New arrivals', fill: { name: 'New arrivals', subject: 'Just in: new books you will love', preheader: 'Fresh titles added this week.', headline: 'New arrivals are here', body: 'We have added fresh titles this week across fiction, non-fiction and exam preparation.\n\nBe the first to pick up your next read.' } },
];

export default function AdminCampaigns() {
  const [data, setData] = useState<Overview | null>(null);
  const [form, setForm] = useState({ ...blank });
  const [preview, setPreview] = useState('');
  const [testTo, setTestTo] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const preselected = (location.state as { emails?: string[] } | null)?.emails;
  const [people, setPeople] = useState<Person[]>([]);
  const [mode, setMode] = useState<'all' | 'selected'>(preselected?.length ? 'selected' : 'all');
  const [chosen, setChosen] = useState<Set<string>>(new Set(preselected || []));
  const [pickQ, setPickQ] = useState('');

  useEffect(() => {
    api.get('/campaigns/subscribers').then(({ data }) => setPeople((data.subscribers as Person[]).filter((p) => p.active))).catch(() => undefined);
  }, []);
  const visiblePeople = useMemo(
    () => people.filter((p) => !pickQ.trim() || `${p.email} ${p.name || ''}`.toLowerCase().includes(pickQ.trim().toLowerCase())),
    [people, pickQ]
  );
  const recipientCount = mode === 'all' ? data?.subscribers ?? 0 : [...chosen].filter((e) => people.some((p) => p.email.toLowerCase() === e.toLowerCase())).length;
  const toggle = (email: string) => setChosen((s) => { const n = new Set(s); if (n.has(email)) n.delete(email); else n.add(email); return n; });

  async function load() {
    try {
      const { data: d } = await api.get('/campaigns');
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { void load(); }, []);

  const set = (k: keyof typeof blank, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  const isDraft = (c?: Campaign) => !c || c.status === 'draft';
  const editing = data?.campaigns.find((c) => c.id === form.id);

  async function run(fn: () => Promise<void>, ok?: string) {
    setBusy(true); setError(''); setMsg('');
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const save = () => run(async () => {
    const { data: saved } = await api.post('/campaigns', form);
    setForm((f) => ({ ...f, id: saved.id }));
    await load();
  }, 'Draft saved');

  const doPreview = () => run(async () => {
    const saved = (await api.post('/campaigns', form)).data;
    setForm((f) => ({ ...f, id: saved.id }));
    const { data: p } = await api.post(`/campaigns/${saved.id}/preview`);
    setPreview(p.html);
    await load();
  });

  const sendTest = () => run(async () => {
    const saved = (await api.post('/campaigns', form)).data;
    setForm((f) => ({ ...f, id: saved.id }));
    const { data: r } = await api.post(`/campaigns/${saved.id}/test`, { to: testTo.trim() || undefined });
    setMsg(`Test email sent to ${r.to}`);
    await load();
  });

  const sendAll = () => run(async () => {
    const saved = (await api.post('/campaigns', form)).data;
    const n = recipientCount;
    if (!(await confirmAction(`Send "${form.subject}" to ${n} subscriber${n === 1 ? '' : 's'} now? This cannot be undone.`))) return;
    const { data: r } = await api.post(`/campaigns/${saved.id}/send`, { confirm: true, emails: mode === 'selected' ? [...chosen] : undefined });
    setMsg(`Queued for ${r.queued} customers. Delivery runs in the background, about 150 a minute.`);
    setForm({ ...blank });
    setPreview('');
    setChosen(new Set());
    setMode('all');
    await load();
  });

  function open(c: Campaign) {
    setForm({ id: c.id, name: c.name, subject: c.subject, preheader: c.preheader || '', headline: c.headline, body: c.body, couponCode: c.coupon_code || '', ctaLabel: c.cta_label, ctaUrl: c.cta_url });
    setPreview('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const locked = !!editing && !isDraft(editing);
  const subjectLen = form.subject.trim().length;

  return (
    <div className="ops-stack">
      <div className="erp-card ops-panel">
        <h2>Promotional emails</h2>
        <p className="muted">
          Send seasonal offers and coupon announcements. Only customers who ticked "email me offers" receive them
          (<strong>{data?.subscribers ?? '...'} subscribers</strong>), and every email has an unsubscribe link.
          Today {data?.sentToday ?? 0} of {data?.dailyCap ?? '...'} daily emails used.
        </p>
        {error ? <p className="erp-error">{error}</p> : null}
        {msg ? <p className="form-msg">{msg}</p> : null}

        <p style={{ margin: '12px 0 6px' }}><strong>Start from a template</strong></p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="erp-btn" disabled={busy || locked} onClick={() => { setForm((f) => ({ ...f, ...p.fill })); setPreview(''); }}>{p.label}</button>
          ))}
        </div>

        <form className="ops-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <label>Campaign name (only you see this)
            <input required value={form.name} maxLength={80} onChange={(e) => set('name', e.target.value)} disabled={locked} />
          </label>
          <label>Email subject ({subjectLen} characters; 30 to 60 reads best on phones)
            <input required value={form.subject} maxLength={120} onChange={(e) => set('subject', e.target.value)} disabled={locked} />
          </label>
          <label>Preview text (shown next to the subject; add extra incentive, do not repeat the subject)
            <input value={form.preheader} maxLength={140} onChange={(e) => set('preheader', e.target.value)} disabled={locked} />
          </label>
          <label>Headline
            <input required value={form.headline} maxLength={100} onChange={(e) => set('headline', e.target.value)} disabled={locked} />
          </label>
          <label style={{ flexBasis: '100%' }}>Message (leave a blank line between paragraphs)
            <textarea required rows={6} value={form.body} maxLength={5000} onChange={(e) => set('body', e.target.value)} disabled={locked} />
          </label>
          <label>Coupon to show (optional)
            <select value={form.couponCode} onChange={(e) => set('couponCode', e.target.value)} disabled={locked}>
              <option value="">No coupon</option>
              {data?.coupons.map((c) => <option key={c.code} value={c.code}>{c.code}{c.description ? ` - ${c.description}` : ''}</option>)}
            </select>
          </label>
          <label>Button text
            <input required value={form.ctaLabel} maxLength={40} onChange={(e) => set('ctaLabel', e.target.value)} disabled={locked} />
          </label>
          <label>Button link
            <input required data-validate="link" value={form.ctaUrl} onChange={(e) => set('ctaUrl', e.target.value)} disabled={locked} />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', flexBasis: '100%' }}>
            <button className="erp-btn primary" disabled={busy || locked}>Save draft</button>
            <button type="button" className="erp-btn" disabled={busy || locked} onClick={doPreview}>Preview</button>
          </div>
        </form>

        <div className="ops-form">
          <label>Send a test to
            <input type="email" placeholder="your@email.com (blank = your login email)" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          </label>
          <button type="button" className="erp-btn" disabled={busy || locked} onClick={sendTest}>Send test email</button>
          <button type="button" className="erp-btn primary" disabled={busy || locked || !recipientCount} onClick={sendAll}>
            Send to {recipientCount} {recipientCount === 1 ? 'subscriber' : 'subscribers'}
          </button>
        </div>

        <div className="audience-box">
          <p style={{ margin: '0 0 8px' }}><strong>Who should get this?</strong></p>
          <div className="audience-modes">
            <label className="check-row"><input type="radio" name="audience" checked={mode === 'all'} onChange={() => setMode('all')} /><span>Everyone subscribed ({data?.subscribers ?? 0})</span></label>
            <label className="check-row"><input type="radio" name="audience" checked={mode === 'selected'} onChange={() => setMode('selected')} /><span>Only the people I choose ({chosen.size} chosen)</span></label>
          </div>
          {mode === 'selected' ? (
            <div className="audience-picker">
              <div className="erp-toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
                <input aria-label="Search people" data-no-validate placeholder="Search email or name" value={pickQ} onChange={(e) => setPickQ(e.target.value)} />
                <button type="button" className="erp-btn" onClick={() => setChosen(new Set(visiblePeople.map((p) => p.email)))}>Select shown</button>
                <button type="button" className="erp-btn" onClick={() => setChosen(new Set())}>Clear</button>
              </div>
              {!visiblePeople.length ? <p className="muted">No subscribers match.</p> : (
                <ul className="audience-list">
                  {visiblePeople.map((p) => (
                    <li key={p.email}>
                      <label className="check-row">
                        <input type="checkbox" checked={chosen.has(p.email)} onChange={() => toggle(p.email)} />
                        <span>{p.name ? `${p.name} ` : ''}<em>{p.email}</em></span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        {preview ? (
          <div style={{ marginTop: 12 }}>
            <h3>Preview</h3>
            <iframe title="Email preview" sandbox="" srcDoc={preview} style={{ width: '100%', maxWidth: 680, height: 620, border: '1px solid #d1d5db', borderRadius: 10, background: '#fff' }} />
          </div>
        ) : null}
      </div>

      <div className="erp-card ops-panel">
        <h2>Campaign history</h2>
        {!data?.campaigns.length ? <p className="muted">No campaigns yet.</p> : (
          <div className="ops-table">
            <table className="erp-table">
              <thead><tr><th>Name</th><th>Subject</th><th>Status</th><th>Recipients</th><th>Delivered</th><th>Failed</th><th>Sent</th><th>Actions</th></tr></thead>
              <tbody>
                {data.campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td><td title={c.subject}>{c.subject}</td><td>{c.status}</td>
                    <td>{c.recipients}</td><td>{c.delivered}</td><td>{c.failed}</td>
                    <td>{c.sent_at ? new Date(c.sent_at).toLocaleString() : '-'}</td>
                    <td>
                      <button type="button" className="erp-btn" onClick={() => open(c)}>{c.status === 'draft' ? 'Edit' : 'View'}</button>
                      {c.status === 'draft' ? (
                        <button type="button" className="erp-btn" disabled={busy} onClick={async () => {
                          if (await confirmAction(`Delete the draft "${c.name}"?`)) await run(async () => { await api.delete(`/campaigns/${c.id}`); await load(); }, 'Draft deleted');
                        }}>Delete</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
