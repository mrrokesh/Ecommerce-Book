import { useEffect, useState, type FormEvent } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

type Member = { id: string; name: string; email: string; role: 'admin' | 'staff'; createdAt: string };

const ROLE_LABEL = { admin: 'Admin · full access', staff: 'Staff · orders only' };
const EMPTY = { name: '', email: '', password: '', role: 'staff' };

export default function AdminStaff() {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    return api
      .get('/admin/staff')
      .then(({ data }) => setMembers(data.staff || []))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await load();
      setNotice(ok);
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const done = await run(
      () => api.post('/admin/staff', form),
      `Added ${form.name}. They can sign in at /admin with ${form.email}.`
    );
    if (done) setForm(EMPTY);
  }

  function onReset(m: Member) {
    const password = window.prompt(`New password for ${m.name} (at least 8 characters):`);
    if (!password) return;
    run(() => api.patch(`/admin/staff/${m.id}/password`, { password }), `Password updated for ${m.name}.`);
  }

  function onRemove(m: Member) {
    if (!window.confirm(`Remove portal access for ${m.name}? Their account stays as a normal customer.`)) return;
    run(() => api.delete(`/admin/staff/${m.id}`), `Removed access for ${m.name}.`);
  }

  return (
    <>
      <div className="erp-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Add staff</h3>
        <form className="erp-editor erp-form" onSubmit={onAdd}>
          <label>
            Name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <label>
            Access
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="staff">{ROLE_LABEL.staff}</option>
              <option value="admin">{ROLE_LABEL.admin}</option>
            </select>
          </label>
          <div className="erp-actions">
            <button type="submit" className="erp-btn primary" disabled={busy}>
              Add staff
            </button>
          </div>
        </form>
        <p className="muted" style={{ margin: 0 }}>
          Staff sign in at <strong>/admin</strong> and only see Orders: they can view and search orders, update
          status, add notes, create shipments and print invoices. Share the password with them directly.
        </p>
      </div>

      <div className="erp-card">
        {error ? <p className="erp-error" style={{ padding: '0.75rem 1rem 0' }}>{error}</p> : null}
        {notice ? <p className="erp-ok" style={{ padding: '0.75rem 1rem 0' }}>{notice}</p> : null}
        <table className="erp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Access</th>
              <th>Added</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.name} {m.id === user?.id ? <span className="erp-pill off">you</span> : null}
                </td>
                <td>{m.email}</td>
                <td>
                  <span className={`erp-pill ${m.role === 'admin' ? 'warn' : 'ok'}`}>{ROLE_LABEL[m.role]}</span>
                </td>
                <td>{new Date(m.createdAt).toLocaleDateString('en-IN')}</td>
                <td>
                  <div className="erp-actions">
                    <button type="button" className="erp-btn ghost" disabled={busy} onClick={() => onReset(m)}>
                      Reset password
                    </button>
                    {m.id !== user?.id ? (
                      <button type="button" className="erp-btn danger" disabled={busy} onClick={() => onRemove(m)}>
                        Remove access
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
