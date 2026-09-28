import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast.jsx';

export default function ContactsImport() {
  const showToast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [tab, setTab] = useState('suggested');
  const [search, setSearch] = useState('');
  const [pattern, setPattern] = useState('');
  const [savePatternToo, setSavePatternToo] = useState(true);
  const [importing, setImporting] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [me, p] = await Promise.all([api.me(), api.contactsPreview()]);
      setPreview(p);
      setPattern(me.contactPattern || '');
      setSelected(new Set(p.suggested.map((c) => c.googleContactId)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const list = tab === 'suggested' ? preview?.suggested : tab === 'other' ? preview?.other : preview?.alreadyImported;
  const filtered = useMemo(() => {
    if (!list) return [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [list, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.googleContactId));

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((c) => next.add(c.googleContactId));
      return next;
    });
  }

  function deselectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((c) => next.delete(c.googleContactId));
      return next;
    });
  }

  async function handleImport() {
    const contacts = [...preview.suggested, ...preview.other].filter((c) => selected.has(c.googleContactId));
    if (contacts.length === 0) {
      setError('Pilih minimal satu kontak dulu.');
      return;
    }
    setImporting(true);
    setError('');
    setSuccess('');
    try {
      const payload = { contacts };
      if (savePatternToo && pattern.trim()) {
        payload.savePattern = { pattern: pattern.trim(), isRegex: false };
      }
      const res = await api.contactsImport(payload);
      const msg = `Berhasil import ${res.imported} outlet baru.`;
      setSuccess(msg);
      showToast('success', msg);
      await load();
    } catch (err) {
      setError(err.message);
      showToast('error', err.message);
    } finally {
      setImporting(false);
    }
  }

  if (loading) return <p className="muted">Mengambil kontak dari Google...</p>;
  if (error && !preview) return <div className="error-box">{error}</div>;

  return (
    <div>
      <h2>Import Kontak Outlet</h2>
      <p className="muted">
        Kontak ditarik dari akun Google kamu (yang biasanya otomatis sinkron dari HP). Total {preview?.total} kontak
        ditemukan, {preview?.alreadyImported.length} sudah pernah diimport.
      </p>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="card">
        <label>Pola nama kontak outlet kamu (biar auto-tercentang tiap sinkron berikutnya)</label>
        <div className="row wrap">
          <input
            style={{ flex: 1, minWidth: 240 }}
            placeholder='contoh: "toko", "TOKO -", nama gaya kamu sendiri (pisah koma kalau lebih dari satu)'
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
          />
          <label className="checkbox-row" style={{ marginBottom: 0 }}>
            <input type="checkbox" checked={savePatternToo} onChange={(e) => setSavePatternToo(e.target.checked)} />
            <span className="muted">Simpan pola ini</span>
          </label>
        </div>
      </div>

      <div className="card">
        <div className="tabs">
          <button className={tab === 'suggested' ? 'active' : ''} onClick={() => setTab('suggested')}>
            Disarankan ({preview?.suggested.length})
          </button>
          <button className={tab === 'other' ? 'active' : ''} onClick={() => setTab('other')}>
            Lainnya ({preview?.other.length})
          </button>
          <button className={tab === 'already' ? 'active' : ''} onClick={() => setTab('already')}>
            Sudah diimport ({preview?.alreadyImported.length})
          </button>
        </div>

        <div className="row wrap" style={{ marginBottom: 12 }}>
          <input placeholder="Cari nama/nomor..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          {tab !== 'already' && (
            <button
              type="button"
              className="secondary"
              onClick={allFilteredSelected ? deselectAllFiltered : selectAllFiltered}
              disabled={filtered.length === 0}
            >
              {allFilteredSelected ? `Batalkan semua yang tampil (${filtered.length})` : `Pilih semua yang tampil (${filtered.length})`}
            </button>
          )}
        </div>

        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.googleContactId}>
                  {tab !== 'already' && (
                    <td style={{ width: 30 }}>
                      <input
                        type="checkbox"
                        checked={selected.has(c.googleContactId)}
                        onChange={() => toggle(c.googleContactId)}
                      />
                    </td>
                  )}
                  <td>{c.name}</td>
                  <td className="muted">{c.phone}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="muted">Tidak ada kontak di sini.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {tab !== 'already' && (
        <button onClick={handleImport} disabled={importing}>
          {importing ? 'Mengimport...' : `Import ${selected.size} kontak terpilih`}
        </button>
      )}
    </div>
  );
}
