import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { googleLoginUrl } from '../lib/api';

const ERROR_MESSAGES = {
  domain_not_allowed: 'Email kamu bukan dari domain yang diizinkan.',
  oauth_failed: 'Login Google gagal. Coba lagi.',
  missing_code: 'Login Google gagal (kode tidak ditemukan). Coba lagi.',
};

export default function Login() {
  const [params] = useSearchParams();
  const error = params.get('error');

  return (
    <div className="center-page">
      <div className="card" style={{ maxWidth: 380, textAlign: 'center' }}>
        <h2>Reminder CITA via WA</h2>
        <p className="muted">
          Login pakai akun Google kamu (yang kontaknya sinkron dari HP), buat import kontak outlet & kirim reminder
          WhatsApp.
        </p>
        {error && <div className="error-box">{ERROR_MESSAGES[error] || 'Terjadi kesalahan saat login.'}</div>}
        <a href={googleLoginUrl()}>
          <button style={{ width: '100%', marginTop: 8 }}>Login dengan Google</button>
        </a>
      </div>
    </div>
  );
}
