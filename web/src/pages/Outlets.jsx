import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast.jsx';

const PAGE_SIZE = 50;

export default function Outlets() {
  const showToast = useToast();
  const [groups, setGroups] = useState([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editGroupIds, setEditGroupIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [detailOutlet, setDetailOutlet] = useState(null);

  // State buat kotak cari "No. Login CITA" di dalam popup detail outlet.
  const [citaEditing, setCitaEditing] = useState(false);
  const [citaSearch, setCitaSearch] = useState('');
  const [citaResults, setCitaResults] = useState([]);
  const [citaManual, setCitaManual] = useState('');
  const [citaSaving, setCitaSaving] = useState(false);
  const [citaError, setCitaError] = useState('');

  // Baris tabel diklik buka popup detail, KECUALI klik-nya kena elemen interaktif
  // (checkbox, tombol, dst) -- itu biarin jalan seperti biasa.
  function handleRowClick(e, outlet) {
    if (e.target.closest('button, input, select, a, label')) return;
    setDetailOutlet(outlet);
    setCitaEditing(false);
    setCitaSearch('');
    setCitaResults([]);
    setCitaManual(outlet.citaLoginPhone || '');
    setCitaError('');
  }

  useEffect(() => {
    if (!citaEditing) return;
    const t = setTimeout(() => {
      api
        .citaRetailerSearch(citaSearch)
        .then((res) => setCitaResults(res.items))
        .catch((err) => setCitaError(err.message));
    }, 300);
    return () => clearTimeout(t);
  }, [citaSearch, citaEditing]);

  async function pickCitaRetailer(r) {
    setCitaSaving(true);
    setCitaError('');
    try {
      // PATCH cuma balikin kolom mentah outlet (gak ada `groups`, itu cuma dilampirin
      // di GET list) -- di-merge ke detailOutlet yang lagi kebuka, JANGAN diganti
      // total, soalnya kalau diganti total field `groups` ilang & bikin modal ini
      // crash pas render (.groups.length dari undefined -> layar putih blank).
      const updated = await api.updateOutlet(detailOutlet.id, { citaLoginPhone: r.citaLoginPhone, citaRetailerId: r.id });
      setDetailOutlet((prev) => ({ ...prev, ...updated }));
      setCitaEditing(false);
      loadOutlets(0, false);
      showToast('success', 'No. Login CITA tersimpan.');
    } catch (err) {
      setCitaError(err.message);
      showToast('error', err.message);
    } finally {
      setCitaSaving(false);
    }
  }

  async function saveCitaManual() {
    if (!citaManual.trim()) return;
    setCitaSaving(true);
    setCitaError('');
    try {
      const updated = await api.updateOutlet(detailOutlet.id, { citaLoginPhone: citaManual.trim() });
      setDetailOutlet((prev) => ({ ...prev, ...updated }));
      setCitaEditing(false);
      loadOutlets(0, false);
      showToast('success', 'No. Login CITA tersimpan.');
    } catch (err) {
      setCitaError(err.message);
      showToast('error', err.message);
    } finally {
      setCitaSaving(false);
    }
  }

  async function clearCitaLogin() {
    setCitaSaving(true);
    setCitaError('');
    try {
      const updated = await api.updateOutlet(detailOutlet.id, { citaLoginPhone: null });
      setDetailOutlet((prev) => ({ ...prev, ...updated }));
      setCitaManual('');
      loadOutlets(0, false);
      showToast('success', 'No. Login CITA dikosongkan.');
    } catch (err) {
      setCitaError(err.message);
      showToast('error', err.message);
    } finally {
      setCitaSaving(false);
    }
  }

  async function loadGroups() {
    setGroups(await api.groups());
  }

  async function loadOutlets(nextOffset = 0, append = false) {
    setLoading(true);
    setError('');
    try {
      const res = await api.outlets({ search, groupId: groupFilter, limit: PAGE_SIZE, offset: nextOffset });
      setTotal(res.total);
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setOffset(nextOffset);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGroups();
    loadOutlets(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadOutlets(0, false), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, groupFilter]);

  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      await api.createGroup(newGroupName.trim());
      setNewGroupName('');
      loadGroups();
      showToast('success', 'Grup berhasil dibuat.');
    } catch (err) {
      setError(err.message);
      showToast('error', err.message);
    }
  }

  async function handleDeleteGroup(id) {
    if (!confirm('Hapus grup ini? Outlet di dalamnya tidak ikut terhapus.')) return;
    try {
      await api.deleteGroup(id);
      loadGroups();
      loadOutlets(0, false);
      showToast('success', 'Grup berhasil dihapus.');
    } catch (err) {
      showToast('error', err.message);
    }
  }

  function startEdit(outlet) {
    setEditingId(outlet.id);
    setEditGroupIds(new Set(outlet.groups.map((g) => g.id)));
  }

  async function saveGroups(outletId) {
    try {
      await api.setOutletGroups(outletId, [...editGroupIds]);
      setEditingId(null);
      loadOutlets(0, false);
      showToast('success', 'Grup outlet tersimpan.');
    } catch (err) {
      showToast('error', err.message);
    }
  }

  async function toggleActive(outlet) {
    try {
      await api.updateOutlet(outlet.id, { isActive: !outlet.isActive });
      loadOutlets(0, false);
      showToast('success', outlet.isActive ? 'Outlet dinonaktifkan.' : 'Outlet diaktifkan.');
    } catch (err) {
      showToast('error', err.message);
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const allVisibleSelected = items.length > 0 && items.every((o) => selectedIds.has(o.id));

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        items.forEach((o) => next.delete(o.id));
      } else {
        items.forEach((o) => next.add(o.id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function runBulkGroupChange(mode) {
    if (!bulkGroupId || selectedIds.size === 0) return;
    setBulkSaving(true);
    setError('');
    setSuccess('');
    try {
      const targets = items.filter((o) => selectedIds.has(o.id));
      await Promise.all(
        targets.map((o) => {
          const currentIds = new Set(o.groups.map((g) => g.id));
          if (mode === 'add') currentIds.add(bulkGroupId);
          else currentIds.delete(bulkGroupId);
          return api.setOutletGroups(o.id, [...currentIds]);
        })
      );
      const groupName = groups.find((g) => g.id === bulkGroupId)?.name || '';
      const msg =
        mode === 'add'
          ? `${targets.length} outlet ditambahkan ke grup "${groupName}".`
          : `${targets.length} outlet dikeluarkan dari grup "${groupName}".`;
      setSuccess(msg);
      showToast('success', msg);
      clearSelection();
      loadGroups();
      loadOutlets(0, false);
    } catch (err) {
      showToast('error', err.message);
      setError(err.message);
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div>
      <h2>Outlet</h2>
      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Grup Outlet</h3>
        <div className="row wrap" style={{ marginBottom: 12 }}>
          {groups.map((g) => (
            <span key={g.id} className="badge gray">
              {g.name} ({g.outletCount}){' '}
              <button
                onClick={() => handleDeleteGroup(g.id)}
                style={{ background: 'none', color: 'inherit', padding: '0 0 0 4px', fontWeight: 400 }}
                title="Hapus grup"
              >
                ×
              </button>
            </span>
          ))}
          {groups.length === 0 && <span className="muted">Belum ada grup.</span>}
        </div>
        <form className="row" onSubmit={handleCreateGroup}>
          <input placeholder="Nama grup baru, mis. Prioritas" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
          <button type="submit">Tambah Grup</button>
        </form>
      </div>

      <div className="card">
        <div className="row wrap" style={{ marginBottom: 14 }}>
          <input placeholder="Cari nama/nomor outlet..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} style={{ width: 200 }}>
            <option value="">Semua grup</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {selectedIds.size > 0 && (
          <div className="row wrap" style={{ marginBottom: 14, padding: 10, background: '#f1f2f4', borderRadius: 8 }}>
            <span style={{ fontWeight: 600 }}>{selectedIds.size} outlet dipilih</span>
            <select value={bulkGroupId} onChange={(e) => setBulkGroupId(e.target.value)} style={{ width: 200 }}>
              <option value="">-- pilih grup --</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button onClick={() => runBulkGroupChange('add')} disabled={!bulkGroupId || bulkSaving}>
              {bulkSaving ? 'Menyimpan...' : 'Tambahkan ke Grup'}
            </button>
            <button className="secondary" onClick={() => runBulkGroupChange('remove')} disabled={!bulkGroupId || bulkSaving}>
              Keluarkan dari Grup
            </button>
            <button className="secondary" onClick={clearSelection}>
              Batalkan Pilihan
            </button>
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}>
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} title="Pilih semua yang tampil" />
              </th>
              <th>Nama Outlet</th>
              <th className="col-hide-mobile">No. HP</th>
              <th className="col-hide-mobile">Grup</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id} className="clickable-row" onClick={(e) => handleRowClick(e, o)}>
                <td>
                  <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} />
                </td>
                <td>{o.name}</td>
                <td className="muted col-hide-mobile">{o.phone}</td>
                <td className={editingId === o.id ? '' : 'col-hide-mobile'}>
                  {editingId === o.id ? (
                    <div className="row wrap">
                      {groups.map((g) => (
                        <label key={g.id} className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={editGroupIds.has(g.id)}
                            onChange={() =>
                              setEditGroupIds((prev) => {
                                const next = new Set(prev);
                                next.has(g.id) ? next.delete(g.id) : next.add(g.id);
                                return next;
                              })
                            }
                          />
                          {g.name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    o.groups.map((g) => (
                      <span key={g.id} className="badge gray" style={{ marginRight: 4 }}>
                        {g.name}
                      </span>
                    )) || <span className="muted">-</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${o.isActive ? 'green' : 'red'}`}>{o.isActive ? 'Aktif' : 'Nonaktif'}</span>
                </td>
                <td>
                  {editingId === o.id ? (
                    <div className="row">
                      <button onClick={() => saveGroups(o.id)}>Simpan</button>
                      <button className="secondary" onClick={() => setEditingId(null)}>
                        Batal
                      </button>
                    </div>
                  ) : (
                    <div className="row">
                      <button className="secondary" onClick={() => startEdit(o)}>
                        Atur Grup
                      </button>
                      <button className="secondary" onClick={() => toggleActive(o)}>
                        {o.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="muted">
                  Belum ada outlet. Import dari halaman "Import Kontak" dulu.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="row between" style={{ marginTop: 14 }}>
          <span className="muted">
            Menampilkan {items.length} dari {total} outlet
          </span>
          {items.length < total && (
            <button className="secondary" onClick={() => loadOutlets(offset + PAGE_SIZE, true)} disabled={loading}>
              Muat lebih banyak
            </button>
          )}
        </div>
      </div>

      {detailOutlet && (
        <div className="modal-overlay" onClick={() => setDetailOutlet(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Detail Outlet</h3>

            <div className="modal-field">
              <div className="modal-label">Nama Outlet</div>
              <div className="modal-value">{detailOutlet.name}</div>
            </div>

            <div className="modal-field">
              <div className="modal-label">No. HP</div>
              <div className="modal-value">{detailOutlet.phone}</div>
            </div>

            <div className="modal-field">
              <div className="modal-label">Status</div>
              <div className="modal-value">
                <span className={`badge ${detailOutlet.isActive ? 'green' : 'red'}`}>
                  {detailOutlet.isActive ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
            </div>

            <div className="modal-field">
              <div className="modal-label">Grup</div>
              <div className="modal-value">
                {(detailOutlet.groups || []).length > 0 ? (
                  (detailOutlet.groups || []).map((g) => (
                    <span key={g.id} className="badge gray" style={{ marginRight: 4 }}>
                      {g.name}
                    </span>
                  ))
                ) : (
                  <span className="muted">Belum ada grup</span>
                )}
              </div>
            </div>

            <div className="modal-field">
              <div className="modal-label">No. Login CITA</div>
              {citaError && <div className="error-box" style={{ marginBottom: 8 }}>{citaError}</div>}

              {!citaEditing ? (
                <div className="row between wrap">
                  <span className="modal-value">
                    {detailOutlet.citaLoginPhone || <span className="muted">Belum diset</span>}
                  </span>
                  <div className="row">
                    <button className="secondary" onClick={() => setCitaEditing(true)}>
                      {detailOutlet.citaLoginPhone ? 'Ganti' : 'Set Nomor'}
                    </button>
                    {detailOutlet.citaLoginPhone && (
                      <button className="secondary" onClick={clearCitaLogin} disabled={citaSaving}>
                        Kosongkan
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Cari dari data resmi TSUB kamu (nama/kode retailer/nomor), atau ketik manual di bawah.
                  </p>
                  <input
                    placeholder="Cari retailer di TSUB kamu..."
                    value={citaSearch}
                    onChange={(e) => setCitaSearch(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 10 }}>
                    {citaResults.map((r) => (
                      <div key={r.id} className="list-row">
                        <span>
                          {r.retailerName} <span className="muted">({r.citaLoginPhone})</span>
                        </span>
                        <button onClick={() => pickCitaRetailer(r)} disabled={citaSaving}>
                          Pilih
                        </button>
                      </div>
                    ))}
                    {citaResults.length === 0 && <p className="muted">Gak ada hasil.</p>}
                  </div>

                  <div className="row">
                    <input
                      placeholder="atau ketik nomor manual"
                      value={citaManual}
                      onChange={(e) => setCitaManual(e.target.value)}
                    />
                    <button onClick={saveCitaManual} disabled={citaSaving || !citaManual.trim()}>
                      Simpan
                    </button>
                  </div>
                  <button
                    className="secondary"
                    style={{ width: '100%', marginTop: 8 }}
                    onClick={() => setCitaEditing(false)}
                  >
                    Batal
                  </button>
                </div>
              )}
            </div>

            <button className="secondary" style={{ width: '100%' }} onClick={() => setDetailOutlet(null)}>
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
