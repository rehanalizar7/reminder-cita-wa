import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, setToken, googleLoginUrl, peekAuthMessage, clearAuthMessage } from '../lib/api';

const ERROR_MESSAGES = {
  domain_not_allowed: 'Email kamu bukan dari domain yang diizinkan.',
  oauth_failed: 'Login Google gagal. Coba lagi.',
  missing_code: 'Login Google gagal (kode tidak ditemukan). Coba lagi.',
  account_not_found: 'Email ini belum terdaftar. Hubungi admin.',
  account_disabled: 'Akun kamu dinonaktifkan. Hubungi admin.',
  access_denied: 'Login Google dibatalkan atau ditolak. Kalau kamu gak membatalkan, minta admin daftarin email kamu sebagai test user di Google Cloud Console.',
};

export default function Login() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const urlError = params.get('error');

  // Pesan dari api.js waktu user ditendang keluar (sesi habis, akun
  // dinonaktifkan, ...). Dibaca sekali, lalu dihapus biar gak muncul lagi.
  const [kickMessage] = useState(() => peekAuthMessage());
  useEffect(() => {
    clearAuthMessage();
  }, []);
  const [dismissedTop, setDismissedTop] = useState(false);
  const topError = dismissedTop
    ? ''
    : urlError
      ? ERROR_MESSAGES[urlError] || `Terjadi kesalahan saat login (${urlError}).`
      : kickMessage;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setFormError('');
    // Pesan error lama (dari redirect) disembunyikan biar gak ketuker sama hasil percobaan ini
    setDismissedTop(true);
    if (urlError) setParams({}, { replace: true });
    if (!username || !password) {
      setFormError('Username dan password wajib diisi.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.login(username.trim(), password);
      setToken(res.token);
      if (res.mustChangePassword) {
        navigate('/change-password', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="center-page">
      <div className="card" style={{ maxWidth: 380 }}>
        <h2 style={{ textAlign: 'center', marginTop: 0 }}>Reminder CITA via WA</h2>

        {topError && <div className="error-box">{topError}</div>}

        <form onSubmit={handleLogin}>
          <div className="field">
            <label>Username</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username kamu"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password kamu"
            />
          </div>
          {formError && <div className="error-box" style={{ marginBottom: 10 }}>{formError}</div>}
          <button type="submit" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
          <span className="muted" style={{ fontSize: 12 }}>atau</span>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
        </div>

        <a href={googleLoginUrl()} style={{ textDecoration: 'none' }}>
          <button className="secondary" style={{ width: '100%' }}>
            Login dengan Google
          </button>
        </a>
      </div>
    </div>
  );
}
