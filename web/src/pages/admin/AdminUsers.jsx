import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast.jsx';
import { useMe, ROLE_LABEL } from '../../lib/me.jsx';

const EMPTY_NEW = { name: '', username: '', password: '', email: '', role: 'ree', tsubId: '' };

const ROLE_HELP = {
  ree: 'REE: pegang 1 TSUB, import outlet sendiri, kirim dari WA sendiri.',
  spv: 'SPV: pegang beberapa TSUB (atur di halaman TSUB), pantau REE-nya & kirim ke outlet tim dari WA sendiri.',
  admin: 'Admin: cuma administrasi. Gak pegang TSUB dan gak kirim reminder.',
};

function UserModal({ user, users, tsubs, isSelf, onClose, onChanged }) {
  const showToast = useToast();
  const [form, setForm] = useState({ name: user.name, username: user.username || '', email: user.email || '', role: user.role });
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [tsubPick, setTsubPick] = useState(user.tsubId || '');

  const roleChanged = form.role !== user.role;
  const holdsTsub = Boolean(user.tsubId) || user.spvTsubs.length > 0;

  async function save(e) {
    e.preventDefault();
    const body = {};
    if (form.name.trim() !== user.name) body.name = form.name;
    if (form.username.trim().toLowerCase() !== (user.username || '')) body.username = form.username;
    if (form.email.trim().toLowerCase() !== (user.email || '')) body.email = form.email;
    if (roleChanged) body.role = form.role;
    if (!Object.keys(body).length) return showToast('error', 'Gak ada yang diubah.');

    if (roleChanged) {
      const willPause = user.role === 'spv' || form.role === 'spv' || form.role === 'admin';
      const msg =
        `Ubah role ${user.name} dari ${ROLE_LABEL[user.role]} jadi ${ROLE_LABEL[form.role]}?` +
        (willPause ? '\n\nSemua jadwal kirim milik akun ini bakal dinonaktifkan (sasaran kirimnya berubah).' : '');
      if (!confirm(msg)) return;
    }

    setSaving(true);
    try {
      const res = await api.adminUpdateUser(user.id, body);
      showToast(
        'success',
        `Akun ${res.name} disimpan.` + (res.schedulesPaused ? ` ${res.schedulesPaused} jadwal dinonaktifkan.` : '')
      );
      onChanged();
      onClose();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    if (newPassword.length < 6) return showToast('error', 'Password minimal 6 karakter.');
    setBusy('pw');
    try {
      await api.adminResetPassword(user.id, newPassword);
      showToast('success', `Password ${user.name} direset. Dia wajib ganti password saat login berikutnya.`);
      setNewPassword('');
      onChanged();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setBusy('');
    }
  }

  async function toggleActive() {
    const next = !user.isActive;
    if (!next && !confirm(`Nonaktifkan ${user.name}? Dia gak bisa login dan jadwal kirimnya gak jalan sampai diaktifkan lagi.`)) return;
    setBusy('active');
    try {
      await api.adminToggleActive(user.id, next);
      showToast('success', next ? `${user.name} diaktifkan.` : `${user.name} dinonaktifkan.`);
      onChanged();
      onClose();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setBusy('');
    }
  }

  async function applyTsub() {
    if (tsubPick === (user.tsubId || '')) return;
    if (!tsubPick) {
      if (!confirm(`Lepas ${user.tsubCode} dari ${user.name}? Dia bakal diminta pilih TSUB lagi pas buka dashboard.`)) return;
    } else {
      const t = tsubs.find((x) => x.id === tsubPick);
      const notes = [];
      if (t?.ree && t.ree.id !== user.id) notes.push(`${t.code} sekarang dipegang ${t.ree.name} — dia bakal jadi tanpa TSUB.`);
      if (user.tsubCode) notes.push(`${user.tsubCode} milik ${user.name} bakal dilepas.`);
      if (!confirm(`Set ${t?.code} ke ${user.name}?${notes.length ? '\n\n' + notes.join('\n') : ''}`)) return;
    }
    setBusy('tsub');
    try {
      if (tsubPick) await api.adminSetTsubRee(tsubPick, user.id);
      else await api.adminSetTsubRee(user.tsubId, null);
      showToast('success', tsubPick ? 'TSUB berhasil diset.' : 'TSUB dilepas.');
      onChanged();
      onClose();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box wide" onClick={(e) => e.stopPropagation()}>
        <h3>
          {user.name}{' '}
          {!user.isActive && <span className="badge red">nonaktif</span>}{' '}
          {user.mustChangePassword && <span className="badge yellow">wajib ganti pw</span>}
        </h3>

        <form onSubmit={save}>
          <div className="form-grid">
            <div className="field">
              <label>Nama</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Username</label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="field">
              <label>Email Google (buat login Google)</label>
              <input
                type="email"
                value={form.email.endsWith('@local') ? '' : form.email}
                placeholder="kosongkan kalau gak pakai login Google"
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={form.role} disabled={isSelf} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="ree">REE</option>
                <option value="spv">SPV</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          {isSelf && <p className="muted">Ini akun kamu sendiri — role-nya gak bisa diubah dari sini.</p>}
          {roleChanged && <p className="muted">{ROLE_HELP[form.role]}</p>}
          {roleChanged && holdsTsub && (
            <div className="warn-box">
              Akun ini masih pegang TSUB. Lepas dulu TSUB-nya (di bawah atau di halaman TSUB) sebelum ganti role — kecuali
              mau jadi REE dan TSUB-nya memang TSUB REE.
            </div>
          )}
          <button type="submit" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </form>

        {user.role === 'ree' && (
          <>
            <div className="section-title">TSUB REE</div>
            <div className="row wrap">
              <select value={tsubPick} onChange={(e) => setTsubPick(e.target.value)} style={{ flex: '1 1 220px', width: 'auto' }}>
                <option value="">— tanpa TSUB —</option>
                {tsubs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code}
                    {t.ree && t.ree.id !== user.id ? ` (dipegang ${t.ree.name})` : ''}
                  </option>
                ))}
              </select>
              <button className="secondary" disabled={busy === 'tsub' || tsubPick === (user.tsubId || '')} onClick={applyTsub}>
                {busy === 'tsub' ? 'Menyimpan...' : 'Terapkan'}
              </button>
            </div>
          </>
        )}

        {user.role === 'spv' && (
          <>
            <div className="section-title">TSUB yang dipegang SPV</div>
            <div className="row wrap">
              {user.spvTsubs.length === 0 && <span className="muted">Belum ada. Atur di halaman TSUB.</span>}
              {user.spvTsubs.map((t) => (
                <span key={t.id} className="badge gray">
                  {t.code}
                </span>
              ))}
            </div>
          </>
        )}

        <div className="section-title">Reset password</div>
        <form onSubmit={resetPassword} className="row wrap">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Password sementara (min. 6 karakter)"
            style={{ flex: '1 1 220px', width: 'auto' }}
            autoComplete="new-password"
          />
          <button type="submit" className="secondary" disabled={busy === 'pw'}>
            {busy === 'pw' ? 'Menyimpan...' : 'Reset'}
          </button>
        </form>

        <div className="section-title">Status akun</div>
        <div className="modal-actions">
          {!isSelf && (
            <button className={user.isActive ? 'danger' : ''} disabled={busy === 'active'} onClick={toggleActive}>
              {user.isActive ? 'Nonaktifkan akun' : 'Aktifkan akun'}
            </button>
          )}
          <button className="secondary" onClick={onClose}>
            Tutup
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Dibuat {user.createdAt ? new Date(user.createdAt).toLocaleDateString('id-ID') : '—'}
          {user.hasGoogle ? ' · pernah login Google' : ''}
          {user.waPhoneNumber ? ` · WA ${user.waPhoneNumber}` : ''}
        </p>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const showToast = useToast();
  const { me } = useMe();
  const [users, setUsers] = useState([]);
  const [tsubs, setTsubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState(EMPTY_NEW);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  async function load() {
    try {
      const [u, t] = await Promise.all([api.adminUsers(), api.adminTsubs()]);
      setUsers(u);
      setTsubs(t);
      setError('');
    } catch (err) {
      setError('Gagal memuat daftar akun: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError('');
    if (!form.name.trim() || !form.username.trim() || !form.password) {
      return setCreateError('Nama, username, dan password wajib diisi.');
    }
    if (form.password.length < 6) return setCreateError('Password minimal 6 karakter.');
    setCreating(true);
    try {
      const body = { name: form.name, username: form.username, password: form.password, role: form.role };
      if (form.email.trim()) body.email = form.email;
      if (form.role === 'ree' && form.tsubId) body.tsubId = form.tsubId;
      const created = await api.adminCreateUser(body);
      showToast('success', `Akun "${created.username}" (${ROLE_LABEL[created.role]}) berhasil dibuat.`);
      setForm(EMPTY_NEW);
      await load();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(
      (u) =>
        (!roleFilter || u.role === roleFilter) &&
        (!statusFilter || (statusFilter === 'active' ? u.isActive : !u.isActive)) &&
        (!q ||
          u.name.toLowerCase().includes(q) ||
          (u.username || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.tsubCode || '').toLowerCase().includes(q))
    );
  }, [users, roleFilter, statusFilter, search]);

  const freeTsubs = tsubs.filter((t) => !t.ree);
  const selected = users.find((u) => u.id === selectedId) || null;

  return (
    <div>
      <h2>Akun</h2>
      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Buat Akun Baru</h3>
        <form onSubmit={handleCreate}>
          <div className="form-grid">
            <div className="field">
              <label>Nama</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama lengkap" />
            </div>
            <div className="field">
              <label>Username</label>
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="huruf kecil, tanpa spasi"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label>Password awal</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Min. 6 karakter"
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label>Email Google (opsional)</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nama@gmail.com" />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, tsubId: '' })}>
                <option value="ree">REE</option>
                <option value="spv">SPV</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {form.role === 'ree' && (
              <div className="field">
                <label>TSUB (opsional)</label>
                <select value={form.tsubId} onChange={(e) => setForm({ ...form, tsubId: e.target.value })}>
                  <option value="">— REE pilih sendiri pas login —</option>
                  {freeTsubs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="muted" style={{ marginTop: 0 }}>{ROLE_HELP[form.role]}</p>
          {createError && <div className="error-box">{createError}</div>}
          <p className="muted" style={{ marginBottom: 10 }}>
            Akun baru wajib ganti password saat pertama login.
          </p>
          <button type="submit" disabled={creating}>
            {creating ? 'Membuat...' : 'Buat Akun'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Daftar Akun ({filtered.length})</h3>
        <div className="toolbar">
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">Semua role</option>
            <option value="ree">REE</option>
            <option value="spv">SPV</option>
            <option value="admin">Admin</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
          <input placeholder="Cari nama / username / email / TSUB..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <p className="muted" style={{ marginTop: 0 }}>Klik baris buat ubah data, role, TSUB, reset password, atau nonaktifkan.</p>
        {loading ? (
          <p className="muted">Memuat...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Role</th>
                <th className="col-hide-mobile">Username</th>
                <th>TSUB</th>
                <th className="col-hide-mobile">WA</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="clickable-row" onClick={() => setSelectedId(u.id)}>
                  <td>
                    {u.name}
                    {u.id === me?.id && <span className="badge gray" style={{ marginLeft: 6 }}>kamu</span>}
                    {u.mustChangePassword && <span className="badge yellow" style={{ marginLeft: 6 }}>ganti pw</span>}
                  </td>
                  <td>{ROLE_LABEL[u.role] || u.role}</td>
                  <td className="muted col-hide-mobile">{u.username || '—'}</td>
                  <td className="muted">
                    {u.role === 'spv' ? u.spvTsubs.map((t) => t.code).join(', ') || '—' : u.tsubCode || '—'}
                  </td>
                  <td className="col-hide-mobile">
                    {u.role === 'admin' ? '—' : <span className={`badge ${u.waConnected ? 'green' : 'gray'}`}>{u.waConnected ? 'Terhubung' : 'Putus'}</span>}
                  </td>
                  <td>
                    <span className={`badge ${u.isActive ? 'green' : 'red'}`}>{u.isActive ? 'Aktif' : 'Nonaktif'}</span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Gak ada akun yang cocok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <UserModal
          key={selected.id}
          user={selected}
          users={users}
          tsubs={tsubs}
          isSelf={selected.id === me?.id}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
