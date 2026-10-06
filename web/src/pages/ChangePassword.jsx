import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, setToken, getToken } from '../lib/api';
import { useToast } from '../lib/toast.jsx';

export default function ChangePassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const showToast = useToast();

  // Token bisa datang dari: (1) URL ?token= (redirect Google OAuth), atau
  // (2) sudah tersimpan di localStorage (user diarahkan dari app).
  useEffect(() => {
    const urlToken = params.get('token');
    if (urlToken) {
      setToken(urlToken);
      // Hapus token dari URL supaya tidak muncul di history / log browser
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState(null, '', url.pathname + (url.search || ''));
    }
  }, []);

  const [mustChange, setMustChange] = useState(null); // null = sedang cek
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!getToken()) {
      navigate('/login', { replace: true });
      return;
    }
    api.me()
      .then((me) => setMustChange(me.mustChangePassword))
      .catch(() => navigate('/login', { replace: true }));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (newPassword.length < 6) {
      setFormError('Password baru minimal 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('Konfirmasi password tidak cocok.');
      return;
    }
    if (!mustChange && !currentPassword) {
      setFormError('Masukkan password saat ini.');
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(mustChange ? null : currentPassword, newPassword);
      showToast('success', 'Password berhasil diganti.');
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (mustChange === null) return null; // tunggu me() selesai

  return (
    <div className="center-page">
      <div className="card" style={{ maxWidth: 380 }}>
        <h2 style={{ marginTop: 0 }}>
          {mustChange ? 'Setel Password Baru' : 'Ganti Password'}
        </h2>
        {mustChange && (
          <p className="muted">Admin menyetel password sementara untuk akunmu. Buat password baru sebelum lanjut.</p>
        )}

        <form onSubmit={handleSubmit}>
          {!mustChange && (
            <div className="field">
              <label>Password Saat Ini</label>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label>Password Baru</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
            />
          </div>
          <div className="field">
            <label>Konfirmasi Password Baru</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {formError && <div className="error-box" style={{ marginBottom: 10 }}>{formError}</div>}
          <button type="submit" style={{ width: '100%' }} disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
