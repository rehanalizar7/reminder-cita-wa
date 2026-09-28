import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../lib/toast.jsx';

// REE state TSUB mereka SEKALI pas pertama kali pakai akun -- gak ditanya
// lagi setelahnya. Ini nentuin data resmi retailer mana yang bisa mereka
// cari pas nyetel "No. Login CITA" di halaman Outlet nanti.
export default function PilihTsub() {
  const navigate = useNavigate();
  const showToast = useToast();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await api.tsubAvailable();
      setItems(res.items);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Kalau REE ini ternyata udah pernah pilih TSUB (mis. buka halaman ini
    // lewat back button), langsung lempar balik ke Dashboard.
    api.me().then((me) => {
      if (me.tsubId) navigate('/', { replace: true });
    });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleClaim(tsub) {
    if (!confirm(`Yakin pilih ${tsub.code}? Ini cuma bisa diset SEKALI dan gak bisa diganti lagi setelahnya.`)) return;
    setClaimingId(tsub.id);
    setError('');
    try {
      await api.tsubClaim(tsub.id);
      showToast('success', `${tsub.code} berhasil dipilih jadi TSUB kamu.`);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      showToast('error', err.message);
      load(); // refresh -- mungkin TSUB-nya udah diambil REE lain barusan
    } finally {
      setClaimingId(null);
    }
  }

  const filtered = items.filter((t) => t.code.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="center-page">
      <div className="card" style={{ maxWidth: 480, width: '100%' }}>
        <h2 style={{ marginTop: 0 }}>Pilih TSUB Kamu</h2>
        <p className="muted">
          Sebelum lanjut, state dulu kode TSUB wilayah kamu. Ini cuma diminta SEKALI -- setelah dipilih, gak bisa
          diganti lagi, dan TSUB yang udah diambil REE lain gak akan muncul di sini.
        </p>

        {error && <div className="error-box">{error}</div>}

        <div className="field">
          <input placeholder="Cari kode TSUB, mis. TSUB014..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <p className="muted">Memuat daftar TSUB...</p>
        ) : (
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {filtered.map((t) => (
              <div key={t.id} className="list-row">
                <span>
                  <strong>{t.code}</strong>{' '}
                  <span className="muted">({t.outletCount} outlet)</span>
                </span>
                <button onClick={() => handleClaim(t)} disabled={claimingId === t.id}>
                  {claimingId === t.id ? 'Menyimpan...' : 'Pilih'}
                </button>
              </div>
            ))}
            {filtered.length === 0 && <p className="muted">Gak ada TSUB yang cocok / semua udah diambil.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
