import { useEffect, useState, type FormEvent } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MODULES, MODULE_LABEL } from './modules';

type Member = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  staffRoleId: number | null;
  staffRoleName: string | null;
  createdAt: string;
};

type Role = { id: number; name: string; permissions: string[]; memberCount: number };

const ADMIN_ACCESS = 'admin';
const EMPTY_MEMBER = { name: '', email: '', password: '', access: '' };
const EMPTY_ROLE = { id: null as number | null, name: '', permissions: [] as string[] };

/** Select value for a member: 'admin' or the staff role id as a string. */
function accessValue(m: Member) {
  return m.role === 'admin' ? ADMIN_ACCESS : String(m.staffRoleId ?? '');
}

function accessBody(value: string) {
  return value === ADMIN_ACCESS ? { role: 'admin' } : { role: 'staff', staffRoleId: Number(value) };
}

export default function AdminStaff() {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [member, setMember] = useState(EMPTY_MEMBER);
  const [role, setRole] = useState(EMPTY_ROLE);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    return Promise.all([api.get('/admin/staff'), api.get('/admin/roles')])
      .then(([s, r]) => {
        setMembers(s.data.staff || []);
        setRoles(r.data.roles || []);
      })
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

  // ---- Roles ----
  function togglePermission(key: string) {
    setRole((r) => ({
      ...r,
      permissions: r.permissions.includes(key) ? r.permissions.filter((p) => p !== key) : [...r.permissions, key],
    }));
  }

  async function onSaveRole(e: FormEvent) {
    e.preventDefault();
    const body = { name: role.name, permissions: role.permissions };
    const done = await run(
      () => (role.id ? api.patch(`/admin/roles/${role.id}`, body) : api.post('/admin/roles', body)),
      role.id ? `Saved role "${role.name}".` : `Created role "${role.name}".`
    );
    if (done) setRole(EMPTY_ROLE);
  }

  function onDeleteRole(r: Role) {
    if (!window.confirm(`Delete role "${r.name}"?`)) return;
    run(() => api.delete(`/admin/roles/${r.id}`), `Deleted role "${r.name}".`);
  }

  // ---- Staff ----
  async function onAddMember(e: FormEvent) {
    e.preventDefault();
    const body = { name: member.name, email: member.email, password: member.password, ...accessBody(member.access) };
    const done = await run(
      () => api.post('/admin/staff', body),
      `Added ${member.name}. They can sign in at /admin with ${member.email}.`
    );
    if (done) setMember(EMPTY_MEMBER);
  }

  function onChangeAccess(m: Member, value: string) {
    run(() => api.patch(`/admin/staff/${m.id}`, accessBody(value)), `Updated access for ${m.name}.`);
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

  function accessOptions() {
    return (
      <>
        <option value={ADMIN_ACCESS}>Admin · full access</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </>
    );
  }

  return (
    <>
      {error ? <p className="erp-error">{error}</p> : null}
      {notice ? <p className="erp-ok">{notice}</p> : null}

      <div className="erp-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>{role.id ? `Edit role: ${role.name || '…'}` : 'Create role'}</h3>
        <form className="erp-form" onSubmit={onSaveRole}>
          <label style={{ maxWidth: 360 }}>
            Role name
            <input
              required
              maxLength={80}
              placeholder="e.g. Order manager, Catalogue editor"
              value={role.name}
              onChange={(e) => setRole({ ...role, name: e.target.value })}
            />
          </label>
          <p className="muted" style={{ margin: '0.85rem 0 0.4rem' }}>
            Sections this role can open
          </p>
          <div className="erp-perm-grid">
            {MODULES.map((m) => (
              <label key={m.key} className={`erp-perm ${role.permissions.includes(m.key) ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={role.permissions.includes(m.key)}
                  onChange={() => togglePermission(m.key)}
                />
                <span>
                  <strong>{m.label}</strong>
                  <small>{m.hint}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="erp-actions" style={{ marginTop: '0.85rem' }}>
            <button type="submit" className="erp-btn primary" disabled={busy || !role.permissions.length}>
              {role.id ? 'Save role' : 'Create role'}
            </button>
            {role.id ? (
              <button type="button" className="erp-btn ghost" onClick={() => setRole(EMPTY_ROLE)}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="erp-card" style={{ marginBottom: '1rem' }}>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Can open</th>
              <th>Staff</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td>{r.permissions.map((p) => MODULE_LABEL[p] || p).join(', ')}</td>
                <td>{r.memberCount}</td>
                <td>
                  <div className="erp-actions">
                    <button
                      type="button"
                      className="erp-btn ghost"
                      onClick={() => setRole({ id: r.id, name: r.name, permissions: [...r.permissions] })}
                    >
                      Edit
                    </button>
                    <button type="button" className="erp-btn danger" disabled={busy} onClick={() => onDeleteRole(r)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!roles.length ? (
              <tr>
                <td colSpan={4} className="muted">
                  No roles yet. Create one above before adding staff.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="erp-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Add staff</h3>
        <form className="erp-editor erp-form" onSubmit={onAddMember}>
          <label>
            Name
            <input required value={member.name} onChange={(e) => setMember({ ...member, name: e.target.value })} />
          </label>
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="off"
              value={member.email}
              onChange={(e) => setMember({ ...member, email: e.target.value })}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={member.password}
              onChange={(e) => setMember({ ...member, password: e.target.value })}
            />
          </label>
          <label>
            Access
            <select required value={member.access} onChange={(e) => setMember({ ...member, access: e.target.value })}>
              <option value="" disabled>
                Choose a role…
              </option>
              {accessOptions()}
            </select>
          </label>
          <div className="erp-actions">
            <button type="submit" className="erp-btn primary" disabled={busy}>
              Add staff
            </button>
          </div>
        </form>
        <p className="muted" style={{ margin: 0 }}>
          Staff sign in at <strong>/admin</strong> and only see the sections their role allows. Share the password with
          them directly.
        </p>
      </div>

      <div className="erp-card">
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
            {members.map((m) => {
              const self = m.id === user?.id;
              return (
                <tr key={m.id}>
                  <td>
                    {m.name} {self ? <span className="erp-pill off">you</span> : null}
                  </td>
                  <td>{m.email}</td>
                  <td>
                    {self ? (
                      <span className="erp-pill warn">Admin · full access</span>
                    ) : (
                      <select
                        value={accessValue(m)}
                        disabled={busy}
                        onChange={(e) => onChangeAccess(m, e.target.value)}
                      >
                        {m.role === 'staff' && !m.staffRoleId ? (
                          <option value="" disabled>
                            No role
                          </option>
                        ) : null}
                        {accessOptions()}
                      </select>
                    )}
                  </td>
                  <td>{new Date(m.createdAt).toLocaleDateString('en-IN')}</td>
                  <td>
                    <div className="erp-actions">
                      <button type="button" className="erp-btn ghost" disabled={busy} onClick={() => onReset(m)}>
                        Reset password
                      </button>
                      {!self ? (
                        <button type="button" className="erp-btn danger" disabled={busy} onClick={() => onRemove(m)}>
                          Remove access
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
