import { useEffect, useState, type FormEvent } from 'react';
import api from '../api/client';

type Field = { key: string; label: string; secret: boolean };
type Partner = {
  code: string;
  name: string;
  enabled: boolean;
  isDefault: boolean;
  configured: boolean;
  docsUrl?: string | null;
  fields: Field[];
  credentials: Record<string, string>;
};

export default function AdminShipping() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [settings, setSettings] = useState({
    autoCreate: false,
    defaultPartner: 'manual',
    pickupPincode: '636001',
    pickupAddress: '',
  });
  const [edit, setEdit] = useState<Partner | null>(null);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    api
      .get('/shipping/admin/config')
      .then(({ data }) => {
        setPartners(data.partners || []);
        setSettings({
          autoCreate: Boolean(data.settings?.autoCreate),
          defaultPartner: data.settings?.defaultPartner || 'manual',
          pickupPincode: data.settings?.pickupPincode || '636001',
          pickupAddress: data.settings?.pickupAddress || '',
        });
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.put('/shipping/admin/settings', settings);
      setPartners(data.partners || []);
      setNotice('Shipping settings saved.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function savePartner(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.put(`/shipping/admin/partners/${edit.code}`, {
        enabled: edit.enabled,
        setDefault: edit.isDefault,
        credentials: creds,
      });
      setPartners(data.partners || []);
      setSettings((s) => ({
        ...s,
        defaultPartner: data.settings?.defaultPartner || s.defaultPartner,
        autoCreate: data.settings?.autoCreate ?? s.autoCreate,
      }));
      setEdit(null);
      setNotice(`${edit.name} updated.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error ? <p className="erp-error">{error}</p> : null}
      {notice ? <p className="erp-ok">{notice}</p> : null}

      <form className="erp-card" onSubmit={saveSettings} style={{ padding: '1rem' }}>
        <h2>Delivery automation</h2>
        <p className="muted">
          Configure Shiprocket, Shadowfax, BlueDart, Delhivery, DTDC, or manual AWB. Turn on auto-create to ship paid
          orders without clicking.
        </p>
        <div className="form-row">
          <label>
            Default partner
            <select
              value={settings.defaultPartner}
              onChange={(e) => setSettings({ ...settings, defaultPartner: e.target.value })}
            >
              {partners.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pickup pincode
            <input
              value={settings.pickupPincode}
              onChange={(e) => setSettings({ ...settings, pickupPincode: e.target.value })}
            />
          </label>
        </div>
        <label>
          Pickup address
          <input
            value={settings.pickupAddress}
            onChange={(e) => setSettings({ ...settings, pickupAddress: e.target.value })}
          />
        </label>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
          <input
            type="checkbox"
            checked={settings.autoCreate}
            onChange={(e) => setSettings({ ...settings, autoCreate: e.target.checked })}
          />
          Auto-create shipment when an order is placed / paid
        </label>
        <button className="erp-btn primary" type="submit" disabled={busy} style={{ marginTop: '0.75rem' }}>
          Save settings
        </button>
      </form>

      <div className="erp-card" style={{ padding: '1rem' }}>
        <h2>Partners</h2>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Partner</th>
              <th>Status</th>
              <th>Default</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.code}>
                <td>
                  <strong>{p.name}</strong>
                  {p.docsUrl ? (
                    <div className="muted">
                      <a href={p.docsUrl} target="_blank" rel="noreferrer">
                        Docs
                      </a>
                    </div>
                  ) : null}
                </td>
                <td>
                  <span className={`erp-pill ${p.enabled || p.code === 'manual' ? 'ok' : 'warn'}`}>
                    {p.enabled || p.code === 'manual' ? (p.configured ? 'ready' : 'enabled') : 'off'}
                  </span>
                </td>
                <td>{p.isDefault || settings.defaultPartner === p.code ? 'Yes' : '—'}</td>
                <td>
                  <button
                    type="button"
                    className="erp-btn ghost"
                    onClick={() => {
                      setEdit(p);
                      setCreds({ ...p.credentials });
                      setNotice('');
                    }}
                  >
                    Configure
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit ? (
        <form className="erp-card" onSubmit={savePartner} style={{ padding: '1rem' }}>
          <h2>{edit.name}</h2>
          {edit.fields.length === 0 ? (
            <p className="muted">Manual mode: enter AWB on each order after courier booking.</p>
          ) : (
            edit.fields.map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  type={f.secret ? 'password' : 'text'}
                  value={creds[f.key] || ''}
                  onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
                  placeholder={f.secret ? '••••••••' : ''}
                  autoComplete="off"
                />
              </label>
            ))
          )}
          {(edit.code === 'bluedart' || edit.code === 'dtdc') && (
            <label>
              Custom API endpoint (optional)
              <input
                value={creds.endpoint || ''}
                onChange={(e) => setCreds({ ...creds, endpoint: e.target.value })}
                placeholder="https://…"
              />
            </label>
          )}
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={edit.enabled}
              onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })}
            />
            Enabled
          </label>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={edit.isDefault}
              onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })}
            />
            Set as default partner
          </label>
          <div className="form-row" style={{ marginTop: '0.75rem' }}>
            <button className="erp-btn primary" type="submit" disabled={busy}>
              Save partner
            </button>
            <button className="erp-btn ghost" type="button" onClick={() => setEdit(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
