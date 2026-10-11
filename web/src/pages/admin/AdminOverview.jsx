import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { AccountStatsTable, AccountStatsDetail, attentionReasons } from '../../components/AccountStats.jsx';

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  async function load() {
    setError('');
    try {
      setData(await api.adminOverview());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.accounts.filter(
      (a) =>
        (!role || a.role === role) &&
        (!q ||
          a.name.toLowerCase().includes(q) ||
          (a.username || '').toLowerCase().includes(q) ||
          (a.tsubCode || '').toLowerCase().includes(q))
    );
  }, [data, role, search]);

  const attention = data ? data.accounts.filter((a) => attentionReasons(a).length > 0) : [];
  const c = data?.counts;
  const t = data?.tsub;

  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Ringkasan</h2>
        <button className="secondary" onClick={load}>
          Muat ulang
        </button>
      </div>
      {error && <div className="error-box">{error}</div>}
      {!data && !error && <p className="muted">Memuat...</p>}

      {data && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Akun</h3>
            <div className="stat-grid">
              <div className="stat-tile">
                <div className="stat-value">{c.ree}</div>
                <div className="stat-label">REE</div>
              </div>
              <div className="stat-tile">
                <div className="stat-value">{c.spv}</div>
                <div className="stat-label">SPV</div>
              </div>
              <div className="stat-tile">
                <div className="stat-value">{c.admin}</div>
                <div className="stat-label">Admin</div>
              </div>
              <div className="stat-tile stat-ok">
                <div className="stat-value">
                  {c.waConnected}/{c.ree + c.spv}
                </div>
                <div className="stat-label">WA terhubung</div>
              </div>
              <div className="stat-tile stat-danger">
                <div className="stat-value">{c.inactive}</div>
                <div className="stat-label">Akun nonaktif</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="row between wrap" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>TSUB</h3>
              <Link to="/tsub">Atur TSUB →</Link>
            </div>
            <div className="stat-grid">
              <div className="stat-tile">
                <div className="stat-value">{t.total}</div>
                <div className="stat-label">Total TSUB</div>
              </div>
              <div className="stat-tile stat-ok">
                <div className="stat-value">{t.withRee}</div>
                <div className="stat-label">Sudah ada REE</div>
              </div>
              <div className="stat-tile stat-warn">
                <div className="stat-value">{t.total - t.withRee}</div>
                <div className="stat-label">Belum ada REE</div>
              </div>
              <div className="stat-tile">
                <div className="stat-value">{t.withSpv}</div>
                <div className="stat-label">Sudah ada SPV</div>
              </div>
            </div>
          </div>

          {attention.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Perlu Perhatian ({attention.length})</h3>
              {attention.map((a) => (
                <div key={a.id} className="list-row clickable-row" onClick={() => setSelected(a)}>
                  <span>
                    <strong>{a.name}</strong> <span className="muted">{a.tsubCode || (a.role === 'spv' ? 'SPV' : '')}</span>
                  </span>
                  <span className="muted" style={{ textAlign: 'right' }}>
                    {attentionReasons(a).join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Aktivitas per Akun</h3>
            <div className="toolbar">
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">REE & SPV</option>
                <option value="ree">REE saja</option>
                <option value="spv">SPV saja</option>
              </select>
              <input placeholder="Cari nama / username / TSUB..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <AccountStatsTable rows={rows} onRowClick={setSelected} showRole emptyText="Gak ada akun yang cocok." />
          </div>
        </>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-box wide" onClick={(e) => e.stopPropagation()}>
            <h3>{selected.name}</h3>
            <AccountStatsDetail a={selected} />
            <button className="secondary" style={{ width: '100%', marginTop: 12 }} onClick={() => setSelected(null)}>
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
