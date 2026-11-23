import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast.jsx';

// Warna badge status pesan -- dipakai bareng di Dashboard, Kirim, SPV.
export const STATUS_BADGE = { PENDING: 'yellow', SENT: 'green', FAILED: 'red', CANCELLED: 'gray' };

// Kotak peringatan + tombol "Batalkan semua" buat pesan yang masih menunggu.
// Cuma muncul kalau ada pesan PENDING. Jumlahnya diambil dari server (semua
// tanggal), bukan dari 200 riwayat terakhir di dashboard.
// `reloadKey` -- ganti nilainya buat maksa hitung ulang dari luar.
export function CancelPendingBar({ onDone, reloadKey }) {
  const showToast = useToast();
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const r = await api.pendingCount();
      setCount(r.count);
    } catch {
      /* diem aja -- bar ini cuma pelengkap */
    }
  }

  useEffect(() => {
    refresh();
  }, [reloadKey]);

  async function handleCancelAll() {
    if (
      !confirm(
        `Batalkan ${count} pesan yang masih menunggu?\n\nPesan yang dibatalkan gak akan dikirim, termasuk kalau WA kamu nyambung lagi nanti. Gak bisa dibatalin.`
      )
    )
      return;
    setBusy(true);
    try {
      const r = await api.cancelPending();
      showToast('success', `${r.cancelled} pesan dibatalkan.`);
      setCount(r.remaining);
      onDone?.();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setBusy(false);
    }
  }

  if (count === 0) return null;

  return (
    <div className="warn-box row between wrap" style={{ gap: 10 }}>
      <span>
        Ada <strong>{count}</strong> pesan masih menunggu dikirim. Kalau WA kamu belum terhubung, semuanya bakal langsung
        dikirim begitu nyambung lagi.
      </span>
      <button className="danger" disabled={busy} onClick={handleCancelAll}>
        {busy ? 'Membatalkan...' : 'Batalkan semua'}
      </button>
    </div>
  );
}

// Tombol batalkan SATU pesan, buat popup detail. Cuma tampil kalau statusnya PENDING.
export function CancelOneButton({ log, onDone }) {
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  if (log?.status !== 'PENDING') return null;

  async function handle() {
    if (!confirm('Batalkan pesan ini? Pesannya gak akan dikirim.')) return;
    setBusy(true);
    try {
      const r = await api.cancelPending([log.id]);
      if (r.cancelled > 0) {
        showToast('success', 'Pesan dibatalkan.');
        onDone?.({ ...log, status: 'CANCELLED', error: 'Dibatalkan sebelum terkirim' });
      } else {
        showToast('error', 'Pesan ini udah keburu dikirim atau diproses.');
        onDone?.(null);
      }
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="danger" style={{ width: '100%', marginBottom: 8 }} disabled={busy} onClick={handle}>
      {busy ? 'Membatalkan...' : 'Batalkan pesan ini'}
    </button>
  );
}
