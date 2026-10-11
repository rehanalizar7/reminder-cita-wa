import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { AccountStatsTable, AccountStatsDetail } from '../../components/AccountStats.jsx';

const STATUS_BADGE = { PENDING: 'yellow', SENT: 'green', FAILED: 'red' };

// Popup detail satu REE tim: statistik + riwayat kirim terbaru REE tersebut.
export function MemberModal({ member, onClose }) {
  const [history, setHistory] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [openLog, setOpenLog] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    setError('');
    api
      .spvMemberHistory(member.id, { limit: 50, status })
      .then((rows) => !cancelled && setHistory(rows))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [member.id, status]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box wide" onClick={(e) => e.stopPropagation()}>
        <h3>{member.name}</h3>
        <AccountStatsDetail a={member}>
          <div className="section-title">Riwayat kirim REE ini</div>
          <div className="tabs" style={{ marginBottom: 8 }}>
            {[
              ['', 'Semua'],
              ['SENT', 'Terkirim'],
              ['FAILED', 'Gagal'],
              ['PENDING', 'Menunggu'],
            ].map(([value, label]) => (
              <button key={value || 'all'} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>
                {label}
              </button>
            ))}
          </div>
          {error && <div className="error-box">{error}</div>}
          {!history && !error && <p className="muted">Memuat...</p>}
          {history && history.length === 0 && <p className="muted">Belum ada riwayat.</p>}
          {history &&
            history.map((h) => (
              <div key={h.id} className="list-row clickable-row" onClick={() => setOpenLog(openLog === h.id ? null : h.id)}>
                <div style={{ minWidth: 0 }}>
                  <div>{h.outletName}</div>
                  {openLog === h.id && (
                    <div className="muted" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>
                      {h.message}
                      {h.error ? `\n\nError: ${h.error}` : ''}
                    </div>
                  )}
                </div>
                <span className="row" style={{ gap: 6, flexShrink: 0 }}>
                  <span className={`badge ${STATUS_BADGE[h.status] || 'gray'}`}>{h.status}</span>
                  <span className="muted nowrap">{new Date(h.createdAt).toLocaleString('id-ID')}</span>
                </span>
              </div>
            ))}
        </AccountStatsDetail>
        <button className="secondary" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          Tutup
        </button>
      </div>
    </div>
  );
}

export default function SpvTeam() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  async function load() {
    setError('');
    try {
      setData(await api.spvTeam());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const emptyTsubs = data ? data.tsubs.filter((t) => !t.ree) : [];

  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Tim REE</h2>
        <button className="secondary" onClick={load}>
          Muat ulang
        </button>
      </div>
      {error && <div className="error-box">{error}</div>}
      {!data && !error && <p className="muted">Memuat...</p>}

      {data && data.tsubs.length === 0 && (
        <div className="warn-box">Kamu belum pegang TSUB mana pun. Minta admin atur TSUB untuk akun SPV kamu.</div>
      )}

      {data && data.tsubs.length > 0 && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>TSUB yang kamu pegang ({data.tsubs.length})</h3>
            <div className="row wrap">
              {data.tsubs.map((t) => (
                <span key={t.id} className={`badge ${t.ree ? 'gray' : 'yellow'}`}>
                  {t.code} · {t.ree ? t.ree.name : 'belum ada REE'}
                </span>
              ))}
            </div>
            {emptyTsubs.length > 0 && (
              <p className="muted" style={{ marginBottom: 0 }}>
                {emptyTsubs.length} TSUB belum ada REE-nya, jadi outlet-nya belum bisa kamu kirimi.
              </p>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Aktivitas REE</h3>
            <p className="muted" style={{ marginTop: -8 }}>
              Angka di sini cuma kiriman dari nomor masing-masing REE. Klik baris buat lihat rincian & riwayatnya.
            </p>
            <AccountStatsTable rows={data.members} onRowClick={setSelected} emptyText="Belum ada REE di TSUB kamu." />
          </div>
        </>
      )}

      {selected && <MemberModal member={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
