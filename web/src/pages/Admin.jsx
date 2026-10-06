import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast.jsx';

export default function Admin() {
  const showToast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form buat akun baru
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Modal reset password
  const [resetTarget, setResetTarget] = useState(null); // { id, name }
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  async function loadUsers() {
    try {
      const data = await api.adminUsers();
      setUsers(data);
    } catch (err) {
      showToast('error', 'Gagal memuat daftar akun: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError('');
    if (!newName || !newUsername || !newPassword) {
      setCreateError('Nama, username, dan password wajib diisi.');
      return;
    }
    setCreating(true);
    try {
      await api.adminCreateUser({
        name: newName,
        username: newUsername,
        password: newPassword,
        email: newEmail || undefined,
      });
      showToast('success', `Akun "${newUsername}" berhasil dibuat.`);
      setNewName(''); setNewUsername(''); setNewPassword(''); setNewEmail('');
      await loadUsers();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(user) {
    try {
      await api.adminToggleActive(user.id, !user.isActive);
      showToast('success', user.isActive ? `${user.name} dinonaktifkan.` : `${user.name} diaktifkan.`);
      await loadUsers();
    } catch (err) {
      showToast('error', err.message);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    if (!resetPassword || resetPassword.length < 6) {
      showToast('error', 'Password minimal 6 karakter.');
      return;
    }
    setResetting(true);
    try {
      await api.adminResetPassword(resetTarget.id, resetPassword);
      showToast('success', `Password ${resetTarget.name} berhasil direset.`);
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div>
      <h2>Panel Admin</h2>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Buat Akun REE Baru</h3>
        <form onSubmit={handleCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>Nama</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nama lengkap" />
            </div>
            <div className="field">
              <label>Username</label>
              <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="username" />
            </div>
            <div className="field">
              <label>Password Awal</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 6 karakter"
              />
            </div>
            <div className="field">
              <label>Email Google (opsional)</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="nama@gmail.com"
              />
            </div>
          </div>
          {createError && <div className="error-box" style={{ marginBottom: 10 }}>{createError}</div>}
          <p className="muted" style={{ marginBottom: 10 }}>
            Akun baru otomatis disetel <strong>must_change_password</strong> — REE wajib ganti password saat pertama login.
          </p>
          <button type="submit" disabled={creating}>
            {creating ? 'Membuat...' : 'Buat Akun'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Daftar Akun ({users.length})</h3>
        {loading ? (
          <p className="muted">Memuat...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th className="col-hide-mobile">Username</th>
                <th className="col-hide-mobile">Email</th>
                <th className="col-hide-mobile">TSUB</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {u.role === 'admin' && (
                      <span className="badge gray" style={{ marginLeft: 6, fontSize: 11 }}>admin</span>
                    )}
                    {u.mustChangePassword && (
                      <span className="badge yellow" style={{ marginLeft: 4, fontSize: 11 }}>ganti pw</span>
                    )}
                  </td>
                  <td className="muted col-hide-mobile">{u.username || '—'}</td>
                  <td className="muted col-hide-mobile">{u.email || '—'}</td>
                  <td className="muted col-hide-mobile">{u.tsubCode || '—'}</td>
                  <td>
                    <span className={`badge ${u.isActive ? (u.waConnected ? 'green' : 'gray') : 'red'}`}>
                      {u.isActive ? (u.waConnected ? 'WA ✓' : 'Aktif') : 'Nonaktif'}
                    </span>
                  </td>
                  <td>
                    <div className="row wrap">
                      <button
                        className="secondary"
                        onClick={() => { setResetTarget({ id: u.id, name: u.name }); setResetPassword(''); }}
                      >
                        Reset PW
                      </button>
                      <button
                        className={u.isActive ? 'secondary' : ''}
                        onClick={() => handleToggleActive(u)}
                      >
                        {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">Belum ada akun.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {resetTarget && (
        <div className="modal-overlay" onClick={() => setResetTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Reset Password — {resetTarget.name}</h3>
            <p className="muted">
              REE akan diminta ganti password lagi saat login berikutnya.
            </p>
            <form onSubmit={handleResetPassword}>
              <div className="field">
                <label>Password Baru</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={resetting}>
                  {resetting ? 'Menyimpan...' : 'Reset Password'}
                </button>
                <button type="button" className="secondary" onClick={() => setResetTarget(null)}>
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
