import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast.jsx';
import { useMe } from '../lib/me.jsx';

export const SAFETY_BADGE = { green: 'green', yellow: 'yellow', red: 'red', gray: 'gray' };
export const SAFETY_LABEL = { green: 'Aman', yellow: 'Waspada', red: 'Berisiko', gray: 'Belum ada data' };
export const SAFETY_ICON = { green: '🟢', yellow: '🟡', red: '🔴', gray: '⚪' };

// Kartu status WhatsApp milik akun yang login (REE atau SPV): hubungkan lewat
// QR, lihat antrian, putuskan koneksi. Dipakai Dashboard REE & Dashboard SPV.
export function WaStatusCard({ description }) {
  const showToast = useToast();
  const { me } = useMe();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  async function refresh() {
    try {
      const s = await api.waStatus();
      setStatus(s);
      return s;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }

  useEffect(() => {
    refresh();
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPolling() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const s = await refresh();
      if (s && s.status === 'open') {
        clearInterval(pollRef.current);
        showToast('success', 'WhatsApp berhasil terhubung.');
      }
    }, 2500);
  }

  async function handleConnect() {
    setError('');
    try {
      await api.waConnect();
      startPolling();
    } catch (err) {
      setError(err.message);
      showToast('error', err.message);
    }
  }

  async function handleLogout() {
    if (!confirm('Putus koneksi WhatsApp? Kamu perlu scan QR lagi buat kirim pesan.')) return;
    try {
      await api.waLogout();
      clearInterval(pollRef.current);
      refresh();
      showToast('success', 'WhatsApp berhasil diputuskan.');
    } catch (err) {
      showToast('error', err.message);
    }
  }

  const connected = status?.status === 'open';

  return (
    <div className="card">
      {error && <div className="error-box">{error}</div>}
      <div className="row between">
        <h3 style={{ margin: 0 }}>Status WhatsApp</h3>
        {connected ? (
          <span className="badge green">Terhubung {status.pendingInQueue ? `· ${status.pendingInQueue} pesan di antrian` : ''}</span>
        ) : status?.status === 'qr' ? (
          <span className="badge yellow">Menunggu scan QR</span>
        ) : status?.status === 'connecting' ? (
          <span className="badge yellow">Menyambungkan...</span>
        ) : (
          <span className="badge gray">Belum terhubung</span>
        )}
      </div>

      {status?.dailyCapReached && (
        <div className="warn-box" style={{ marginTop: 12, marginBottom: 0 }}>
          Batas kirim harian udah tercapai. Sisa antrian lanjut otomatis besok.
        </div>
      )}

      {!connected && status?.status !== 'qr' && (
        <div style={{ marginTop: 14 }}>
          <p className="muted">
            {description ||
              'Hubungkan nomor WhatsApp kamu sendiri buat kirim reminder ke outlet. Scan QR pakai HP yang sama dengan nomor yang mau dipakai.'}
          </p>
          <button onClick={handleConnect}>Hubungkan WhatsApp</button>
        </div>
      )}

      {status?.status === 'qr' && status.qrDataUrl && (
        <div className="qr-box">
          <img src={status.qrDataUrl} alt="QR WhatsApp" />
          <p className="muted">Buka WhatsApp di HP → Perangkat Tertaut → Tautkan Perangkat → scan kode ini.</p>
        </div>
      )}

      {connected && (
        <div style={{ marginTop: 14 }}>
          <p className="muted">
            Nomor tersambung: <strong>{status.waPhoneNumber || me?.waPhoneNumber || '-'}</strong>
          </p>
          <button className="danger" onClick={handleLogout}>
            Putuskan Koneksi
          </button>
        </div>
      )}
    </div>
  );
}

// Isi rincian level keamanan (dipakai di popup Dashboard & popup detail REE di halaman SPV).
export function SafetyDetail({ safety, subject = 'kamu sendiri' }) {
  return (
    <>
      <p className="muted" style={{ marginTop: -6 }}>{safety.summary}</p>

      {safety.warmupDays !== undefined && safety.warmupDays !== null && (
        <div className="modal-field">
          <div className="modal-label">Ringkasan angka (7 hari terakhir)</div>
          <div className="modal-value">
            Umur nomor: {safety.warmupDays} hari · Rata-rata kirim: {safety.avgDailySent7d}/hari · Gagal kirim:{' '}
            {Math.round(safety.failureRate7d * 1000) / 10}% · Kena batas harian: {safety.capHitDays7d}x
          </div>
        </div>
      )}

      {(safety.factors || []).map((f) => (
        <div className="modal-field" key={f.key}>
          <div className="modal-label">
            <span className={`badge ${SAFETY_BADGE[f.level]}`} style={{ marginRight: 6 }}>
              {SAFETY_ICON[f.level]}
            </span>
            {f.label}
          </div>
          <div className="modal-value">{f.detail}</div>
        </div>
      ))}

      {(safety.recommendations || []).length > 0 && (
        <div className="modal-field">
          <div className="modal-label">Saran</div>
          <div className="modal-value">
            {safety.recommendations.map((r, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                • {r}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12 }}>
        Catatan: ini perkiraan berdasarkan pola kirim {subject}, bukan data resmi dari WhatsApp — WhatsApp gak pernah
        publikasikan batas pastinya. Anggap ini panduan, bukan jaminan.
      </p>
    </>
  );
}

// Kartu "Level Keamanan Nomor" + popup rinciannya, buat nomor akun yang login.
export function SafetyCard() {
  const [safety, setSafety] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api
      .waSafety()
      .then(setSafety)
      .catch(() => {
        // Non-krusial -- gagal ambil skor keamanan cukup gak nampilin kartunya.
      });
  }, []);

  if (!safety || safety.level === 'gray') return null;

  return (
    <>
      <div className="card clickable-row" onClick={() => setOpen(true)}>
        <div className="row between wrap">
          <div>
            <h3 style={{ margin: 0 }}>Level Keamanan Nomor</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>{safety.summary}</p>
          </div>
          <span className={`badge ${SAFETY_BADGE[safety.level]}`} style={{ fontSize: 13, padding: '5px 12px' }}>
            {SAFETY_ICON[safety.level]} {SAFETY_LABEL[safety.level]} · {safety.score}/100
          </span>
        </div>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>Klik buat lihat rinciannya.</p>
      </div>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>
              {SAFETY_ICON[safety.level]} Level Keamanan: {SAFETY_LABEL[safety.level]} ({safety.score}/100)
            </h3>
            <SafetyDetail safety={safety} />
            <button className="secondary" style={{ width: '100%' }} onClick={() => setOpen(false)}>
              Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
}
