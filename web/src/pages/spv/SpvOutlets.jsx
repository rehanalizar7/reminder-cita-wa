import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

const PAGE_SIZE = 100;

// Outlet milik REE di tim SPV -- read-only. Yang ngedit data outlet tetap REE
// pemiliknya (nama, nomor, No. Login CITA, grup).
export default function SpvOutlets() {
  const [members, setMembers] = useState([]);
  const [reeId, setReeId] = useState('');
  const [search, setSearch] = useState('');
  const [isActive, setIsActive] = useState('true');
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const reqId = useRef(0);

  useEffect(() => {
    api
      .spvTeam()
      .then((t) => setMembers(t.members))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .spvOutlets({ reeId, search: search.trim(), isActive, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
        .then((res) => {
          if (id !== reqId.current) return;
          setData(res);
          setError('');
        })
        .catch((err) => id === reqId.current && setError(err.message))
        .finally(() => id === reqId.current && setLoading(false));
    }, 250); // debounce ketikan pencarian
    return () => clearTimeout(timer);
  }, [reeId, search, isActive, page]);

  // Filter berubah -> balik ke halaman pertama
  useEffect(() => {
    setPage(0);
  }, [reeId, search, isActive]);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div>
      <h2>Outlet Tim</h2>
      {error && <div className="error-box">{error}</div>}
      <div className="info-box">
        Data outlet dikelola REE masing-masing. Di sini kamu cuma bisa lihat, buat milih target kirim reminder.
      </div>

      <div className="card">
        <div className="toolbar">
          <select value={reeId} onChange={(e) => setReeId(e.target.value)}>
            <option value="">Semua REE</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.tsubCode} · {m.name}
              </option>
            ))}
          </select>
          <select value={isActive} onChange={(e) => setIsActive(e.target.value)}>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
            <option value="">Semua status</option>
          </select>
          <input placeholder="Cari nama / nomor outlet..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          {loading ? 'Memuat...' : `${data.total} outlet`}
        </p>

        <table>
          <thead>
            <tr>
              <th>Outlet</th>
              <th className="col-hide-mobile">No. WA</th>
              <th>REE</th>
              <th className="col-hide-mobile">No. Login CITA</th>
              <th className="col-hide-mobile">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((o) => (
              <tr key={o.id} className="clickable-row" onClick={() => setDetail(o)}>
                <td>{o.name}</td>
                <td className="muted col-hide-mobile">{o.phone}</td>
                <td className="nowrap">
                  {o.ownerName}
                  <div className="muted">{o.tsubCode || ''}</div>
                </td>
                <td className="muted col-hide-mobile">{o.citaLoginPhone || '—'}</td>
                <td className="col-hide-mobile">
                  <span className={`badge ${o.isActive ? 'green' : 'gray'}`}>{o.isActive ? 'Aktif' : 'Nonaktif'}</span>
                </td>
              </tr>
            ))}
            {!loading && data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Gak ada outlet yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {data.total > PAGE_SIZE && (
          <div className="pager">
            <button className="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              ← Sebelumnya
            </button>
            <span className="muted">
              Hal {page + 1} / {totalPages}
            </span>
            <button className="secondary" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Berikutnya →
            </button>
          </div>
        )}
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>{detail.name}</h3>
            <div className="modal-field">
              <div className="modal-label">No. WA</div>
              <div className="modal-value">{detail.phone}</div>
            </div>
            <div className="modal-field">
              <div className="modal-label">REE pemilik</div>
              <div className="modal-value">
                {detail.ownerName} {detail.tsubCode ? `(${detail.tsubCode})` : ''}
              </div>
            </div>
            <div className="modal-field">
              <div className="modal-label">No. Login CITA</div>
              <div className="modal-value">{detail.citaLoginPhone || 'Belum diisi REE'}</div>
            </div>
            <div className="modal-field">
              <div className="modal-label">Status</div>
              <div className="modal-value">
                <span className={`badge ${detail.isActive ? 'green' : 'gray'}`}>{detail.isActive ? 'Aktif' : 'Nonaktif'}</span>
              </div>
            </div>
            {detail.notes && (
              <div className="modal-field">
                <div className="modal-label">Catatan</div>
                <div className="modal-value">{detail.notes}</div>
              </div>
            )}
            <button className="secondary" style={{ width: '100%' }} onClick={() => setDetail(null)}>
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
