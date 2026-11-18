import { useEffect, useState, type FormEvent } from 'react';
import { confirmAction } from '../components/Dialogs';
import { showToast } from '../components/Toast';
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
  status: 'active' | 'invited' | 'suspended';
  lastSignInAt: string | null;
  createdAt: string;
};

type Role = { id: number; name: string; permissions: string[]; memberCount: number };

const ADMIN_ACCESS = 'admin';
const EMPTY_INVITE = { name: '', email: '', access: '' };
const EMPTY_ROLE = { id: null as number | null, name: '', permissions: [] as string[] };

function accessValue(m: Member) {
  return m.role === 'admin' ? ADMIN_ACCESS : String(m.staffRoleId ?? '');
}

function accessBody(value: string) {
  return value === ADMIN_ACCESS ? { role: 'admin' } : { role: 'staff', staffRoleId: Number(value) };
}

function roleLabel(m: Member) {
  return m.role === 'admin' ? 'Admin' : m.staffRoleName || 'Staff';
}

function formatWhen(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function AdminStaff() {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [invite, setInvite] = useState(EMPTY_INVITE);
  const [editId, setEditId] = useState<string | null>(null);
  const [editAccess, setEditAccess] = useState('');
  const [role, setRole] = useState(EMPTY_ROLE);
  const [showInvite, setShowInvite] = useState(false);
  const [error, setError] = useState('');
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

  async function run<T>(action: () => Promise<T>, ok?: string): Promise<T | null> {
    setBusy(true);
    setError('');
    try {
      const result = await action();
      await load();
      if (ok) showToast(ok);
      return result;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function accessOptions() {
    return (
      <>
        <option value={ADMIN_ACCESS}>Admin</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </>
    );
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!invite.access) {
      setError('Please choose a role');
      return;
    }
    const result = await run(async () => {
      const { data } = await api.post('/admin/staff/invite', {
        name: invite.name,
        email: invite.email,
        ...accessBody(invite.access),
      });
      return data as { inviteUrl?: string };
    }, 'User invited');
    if (!result) return;
    setInvite(EMPTY_INVITE);
    setShowInvite(false);
    if (result.inviteUrl && (await copyText(result.inviteUrl))) showToast('Invitation link copied');
  }

  async function onCopyInvite(m: Member) {
    const data = await run(async () => {
      const { data } = await api.post(`/admin/staff/${m.id}/invite-link`);
      return data as { inviteUrl?: string };
    });
    if (data?.inviteUrl && (await copyText(data.inviteUrl))) showToast('Invitation link copied');
  }

  async function onNewInvite(m: Member) {
    const data = await run(async () => {
      const { data } = await api.post(`/admin/staff/${m.id}/invite-link`);
      return data as { inviteUrl?: string };
    }, 'New invite link sent');
    if (data?.inviteUrl && (await copyText(data.inviteUrl))) showToast('Invitation link copied');
  }

  async function onResetLink(m: Member) {
    const data = await run(async () => {
      const { data } = await api.post(`/admin/staff/${m.id}/reset-link`);
      return data as { resetUrl?: string };
    }, 'Password reset link sent');
    if (data?.resetUrl && (await copyText(data.resetUrl))) showToast('Password reset link copied');
  }

  function openEdit(m: Member) {
    setEditId(m.id);
    setEditAccess(accessValue(m));
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editId) return;
    const done = await run(() => api.patch(`/admin/staff/${editId}`, accessBody(editAccess)), 'User updated');
    if (done) setEditId(null);
  }

  async function onSuspend(m: Member) {
    if (
      !(await confirmAction(
        `Suspend ${m.name}? They cannot sign in to the admin portal until you restore them. Their account stays on the Users list.`,
      ))
    )
      return;
    run(() => api.patch(`/admin/staff/${m.id}/status`, { status: 'suspended' }), `Suspended ${m.name}`);
  }

  async function onRestore(m: Member) {
    run(() => api.patch(`/admin/staff/${m.id}/status`, { status: 'active' }), `Restored ${m.name}`);
  }

  async function onRemove(m: Member) {
    if (!(await confirmAction(`Remove portal access for ${m.name}? Their account stays as a normal customer.`))) return;
    run(() => api.delete(`/admin/staff/${m.id}`), `Removed ${m.name}`);
  }

  function statusPill(status: Member['status']) {
    if (status === 'invited') return { className: 'warn', label: 'Invited' };
    if (status === 'suspended') return { className: 'off', label: 'Suspended' };
    return { className: 'ok', label: 'Active' };
  }

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
      role.id ? `Saved role "${role.name}"` : `Created role "${role.name}"`
    );
    if (done) setRole(EMPTY_ROLE);
  }

  async function onDeleteRole(r: Role) {
    if (!(await confirmAction(`Delete role "${r.name}"?`))) return;
    run(() => api.delete(`/admin/roles/${r.id}`), `Deleted role "${r.name}"`);
  }

  const editing = editId ? members.find((m) => m.id === editId) : null;

  return (
    <div className="a-users">
      {error ? <p className="erp-error">{error}</p> : null}

      <div className="a-pagehead">
        <div>
          <h1>Users</h1>
          <p className="muted">
            Invited users get a personal link (and email) to set their password. Copy the link anytime to send by chat.
          </p>
        </div>
        <div className="a-pagehead-actions">
          <button type="button" className="erp-btn primary" onClick={() => setShowInvite(true)} disabled={busy}>
            + Invite user
          </button>
        </div>
      </div>

      <div className="erp-card">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last sign-in</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const self = m.id === user?.id;
              const invited = m.status === 'invited';
              const suspended = m.status === 'suspended';
              const pill = statusPill(m.status);
              return (
                <tr key={m.id} className={suspended ? 'is-muted' : undefined}>
                  <td>
                    <strong>{m.name}</strong>
                    {self ? <span className="muted"> (you)</span> : null}
                  </td>
                  <td>{m.email}</td>
                  <td>{roleLabel(m)}</td>
                  <td>
                    <span className={`erp-pill ${pill.className}`}>{pill.label}</span>
                  </td>
                  <td className="muted">{formatWhen(m.lastSignInAt)}</td>
                  <td>
                    <div className="a-row-actions">
                      {invited ? (
                        <>
                          <button type="button" className="a-link" disabled={busy} onClick={() => onCopyInvite(m)}>
                            Copy invite link
                          </button>
                          <button type="button" className="a-link" disabled={busy} onClick={() => onNewInvite(m)}>
                            New link
                          </button>
                        </>
                      ) : !self && !suspended ? (
                        <button type="button" className="a-link" disabled={busy} onClick={() => onResetLink(m)}>
                          Password reset link
                        </button>
                      ) : null}
                      {!self ? (
                        <>
                          {!invited ? (
                            <button type="button" className="a-link primary" disabled={busy} onClick={() => openEdit(m)}>
                              Edit
                            </button>
                          ) : null}
                          {suspended ? (
                            <button type="button" className="a-link primary" disabled={busy} onClick={() => onRestore(m)}>
                              Restore
                            </button>
                          ) : !invited ? (
                            <button type="button" className="a-link" disabled={busy} onClick={() => onSuspend(m)}>
                              Suspend
                            </button>
                          ) : null}
                          <button type="button" className="a-link danger" disabled={busy} onClick={() => onRemove(m)}>
                            Remove
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!members.length ? (
              <tr>
                <td colSpan={6} className="muted">
                  No portal users yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="erp-card a-roles-panel" style={{ padding: '1rem', marginTop: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>{role.id ? `Edit role: ${role.name || '…'}` : 'Roles & modules'}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Create roles and tick which admin sections they can open. Assign a role when you invite a user.
        </p>
        <form className="erp-form" onSubmit={onSaveRole}>
          <label style={{ maxWidth: 360 }}>
            Role name
            <input
              required
              maxLength={80}
              placeholder="e.g. Order manager"
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
                <input type="checkbox" checked={role.permissions.includes(m.key)} onChange={() => togglePermission(m.key)} />
                <span>
                  <strong>{m.label}</strong>
                  <small>{m.hint}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="erp-form-actions" style={{ marginTop: '0.85rem' }}>
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

        <table className="erp-table" style={{ marginTop: '1rem' }}>
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
                  <div className="a-row-actions">
                    <button
                      type="button"
                      className="a-link"
                      onClick={() => setRole({ id: r.id, name: r.name, permissions: [...r.permissions] })}
                    >
                      Edit
                    </button>
                    <button type="button" className="a-link danger" disabled={busy} onClick={() => onDeleteRole(r)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!roles.length ? (
              <tr>
                <td colSpan={4} className="muted">
                  No roles yet. Create one above before inviting staff with limited access.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {showInvite ? (
        <div className="a-modal-backdrop" onClick={() => !busy && setShowInvite(false)}>
          <div className="a-modal" role="dialog" aria-labelledby="invite-title" onClick={(e) => e.stopPropagation()}>
            <header className="a-modal-head">
              <h2 id="invite-title">Invite user</h2>
              <button type="button" className="a-modal-close" aria-label="Close" onClick={() => setShowInvite(false)}>
                ×
              </button>
            </header>
            <form className="erp-form a-modal-body" onSubmit={onInvite}>
              <label>
                <span>Name <span className="req">*</span></span>
                <input required value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
              </label>
              <label>
                <span>Email <span className="req">*</span></span>
                <input
                  type="email"
                  required
                  autoComplete="off"
                  value={invite.email}
                  onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                />
              </label>
              <label>
                <span>Role <span className="req">*</span></span>
                <select required value={invite.access} onChange={(e) => setInvite({ ...invite, access: e.target.value })}>
                  <option value="" disabled>
                    Select a role
                  </option>
                  {accessOptions()}
                </select>
              </label>
              <div className="erp-form-actions" style={{ marginTop: '0.5rem' }}>
                <button type="submit" className="erp-btn primary" disabled={busy}>
                  {busy ? 'Sending…' : 'Send invite'}
                </button>
                <button type="button" className="erp-btn ghost" disabled={busy} onClick={() => setShowInvite(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="a-modal-backdrop" onClick={() => !busy && setEditId(null)}>
          <div className="a-modal" role="dialog" aria-labelledby="edit-user-title" onClick={(e) => e.stopPropagation()}>
            <header className="a-modal-head">
              <h2 id="edit-user-title">Edit user</h2>
              <button type="button" className="a-modal-close" aria-label="Close" onClick={() => setEditId(null)}>
                ×
              </button>
            </header>
            <form className="erp-form a-modal-body" onSubmit={onSaveEdit}>
              <p className="muted" style={{ marginTop: 0 }}>
                {editing.name} · {editing.email}
              </p>
              <label>
                <span>Role <span className="req">*</span></span>
                <select required value={editAccess} onChange={(e) => setEditAccess(e.target.value)}>
                  {accessOptions()}
                </select>
              </label>
              <div className="erp-form-actions" style={{ marginTop: '0.5rem' }}>
                <button type="submit" className="erp-btn primary" disabled={busy}>
                  Save
                </button>
                <button type="button" className="erp-btn ghost" disabled={busy} onClick={() => setEditId(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
