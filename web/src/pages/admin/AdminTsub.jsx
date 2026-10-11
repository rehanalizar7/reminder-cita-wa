import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast.jsx';

export default function AdminTsub() {
  const showToast = useToast();
  const [tsubs, setTsubs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [newCode, setNewCode] = useState('');
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const [t, u] = await Promise.all([api.adminTsubs(), api.adminUsers()]);
      setTsubs(t);
      setUsers(u);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const rees = useMemo(() => users.filter((u) => u.role === 'ree'), [users]);
  const spvs = useMemo(() => users.filter((u) => u.role === 'spv'), [users]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tsubs.filter((t) => {
      if (filter === 'no-ree' && t.ree) return false;
      if (filter === 'no-spv' && t.spv) return false;
      if (!q) return true;
      return (
        t.code.toLowerCase().includes(q) ||
        (t.ree?.name || '').toLowerCase().includes(q) ||
        (t.ree?.username || '').toLowerCase().includes(q) ||
        (t.spv?.name || '').toLowerCase().includes(q)
      );
    });
  }, [tsubs, search, filter]);

  async function changeRee(t, reeId) {
    const current = t.ree?.id || '';
    if (reeId === current) return;
    const target = rees.find((u) => u.id === reeId);
    let msg;
    if (!reeId) {
      msg = `Lepas ${t.code} dari ${t.ree.name}? Dia bakal diminta pilih TSUB lagi pas buka dashboard.`;
    } else {
      const notes = [];
      if (t.ree) notes.push(`${t.ree.name} (pemegang sekarang) bakal jadi tanpa TSUB.`);
      if (target?.tsubCode && target.tsubId !== t.id) notes.push(`${target.tsubCode} milik ${target.name} bakal dilepas.`);
      msg = `Set ${t.code} ke ${target?.name}?${notes.length ? '\n\n' + notes.join('\n') : ''}`;
    }
    if (!confirm(msg)) return;
    setBusyId(t.id);
    try {
      await api.adminSetTsubRee(t.id, reeId || null);
      showToast('success', reeId ? `${t.code} sekarang dipegang ${target?.name}.` : `${t.code} dilepas.`);
      await load();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function changeSpv(t, spvId) {
    const current = t.spv?.id || '';
    if (spvId === current) return;
    const target = spvs.find((u) => u.id === spvId);
    const msg = !spvId
      ? `Lepas ${t.code} dari SPV ${t.spv.name}?`
      : `Set SPV ${t.code} ke ${target?.name}?${t.spv ? `\n\n${t.spv.name} gak pegang ${t.code} lagi.` : ''}`;
    if (!confirm(msg)) return;
    setBusyId(t.id);
    try {
      await api.adminSetTsubSpv(t.id, spvId || null);
      showToast('success', spvId ? `${t.code} masuk tim ${target?.name}.` : `${t.code} dilepas dari SPV.`);
      await load();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function addTsub(e) {
    e.preventDefault();
    if (!newCode.trim()) return;
    setAdding(true);
    try {
      const created = await api.adminCreateTsub(newCode);
      showToast('success', `${created.code} ditambahkan.`);
      setNewCode('');
      await load();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <h2>TSUB</h2>
      {error && <div className="error-box">{error}</div>}

      <div className="info-box">
        Satu TSUB dipegang <strong>satu REE</strong> dan maksimal <strong>satu SPV</strong>. REE di TSUB yang dipegang SPV
        otomatis jadi tim SPV itu.
      </div>

      <div className="card">
        <div className="toolbar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Semua TSUB</option>
            <option value="no-ree">Belum ada REE</option>
            <option value="no-spv">Belum ada SPV</option>
          </select>
          <input placeholder="Cari kode / nama REE / nama SPV..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {loading ? 'Memuat...' : `${rows.length} dari ${tsubs.length} TSUB`}
        </p>

        <table>
          <thead>
            <tr>
              <th>Kode</th>
              <th className="num col-hide-mobile">Data retailer</th>
              <th>Pemegang (REE · SPV)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="nowrap">
                  <strong>{t.code}</strong>
                  {t.ree && !t.ree.isActive && <div className="badge red">REE nonaktif</div>}
                </td>
                <td className="num col-hide-mobile">{t.retailerCount}</td>
                <td>
                  <div className="assign-cell">
                    <label className="assign-field">
                      <span>REE</span>
                      <select
                        className="inline-select"
                        value={t.ree?.id || ''}
                        disabled={busyId === t.id}
                        onChange={(e) => changeRee(t, e.target.value)}
                      >
                        <option value="">— belum ada —</option>
                        {rees.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.username || u.email})
                            {u.tsubCode && u.tsubId !== t.id ? ` · pegang ${u.tsubCode}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="assign-field">
                      <span>SPV</span>
                      <select
                        className="inline-select"
                        value={t.spv?.id || ''}
                        disabled={busyId === t.id}
                        onChange={(e) => changeSpv(t, e.target.value)}
                      >
                        <option value="">— belum ada —</option>
                        {spvs.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  Gak ada TSUB yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tambah Kode TSUB</h3>
        <p className="muted" style={{ marginTop: -6 }}>
          Buat wilayah baru yang belum ada di data Excel. Data retailer-nya tetap diimport lewat script import di server.
        </p>
        <form onSubmit={addTsub} className="row wrap">
          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            placeholder="mis. TSUB060"
            style={{ flex: '1 1 200px', width: 'auto' }}
          />
          <button type="submit" disabled={adding || !newCode.trim()}>
            {adding ? 'Menambah...' : 'Tambah'}
          </button>
        </form>
      </div>
    </div>
  );
}
