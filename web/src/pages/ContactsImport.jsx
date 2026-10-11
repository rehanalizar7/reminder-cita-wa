import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../lib/toast.jsx';

// ─── Badge constants ──────────────────────────────────────────────────────────

const STATUS_LABEL = { new: 'Baru', exists: 'Sudah ada', invalid: 'Tidak valid', duplicate_in_batch: 'Duplikat' };
const STATUS_CLASS = { new: 'green', exists: 'gray', invalid: 'red', duplicate_in_batch: 'yellow' };
const WARN_LABEL = { group_new: 'grup baru', cita_not_found: 'CITA ?' };

// Tab definition — sama untuk semua sumber
const PREVIEW_TABS = [
  { key: 'new',   label: 'Baru',        filter: (r) => r.status === 'new' },
  { key: 'exists',label: 'Sudah ada',   filter: (r) => r.status === 'exists' },
  { key: 'dup',   label: 'Duplikat',    filter: (r) => r.status === 'duplicate_in_batch' },
  { key: 'inv',   label: 'Tidak valid', filter: (r) => r.status === 'invalid' },
];

// ─── Tabel preview ────────────────────────────────────────────────────────────

function PreviewTable({ rows, selected, onToggle, onToggleAll }) {
  const [activeTab, setActiveTab] = useState('new');
  const [search, setSearch] = useState('');

  const activeDef = PREVIEW_TABS.find((t) => t.key === activeTab) || PREVIEW_TABS[0];
  const tabRows = rows.filter(activeDef.filter);
  const visibleRows = search.trim()
    ? tabRows.filter((r) => {
        const q = search.toLowerCase();
        return (r.name || '').toLowerCase().includes(q) ||
               (r.normalizedPhone || r.phone || '').includes(search);
      })
    : tabRows;

  // "Pilih/Kosongkan" hanya berlaku untuk baris baru yang sedang tampil
  const selectableVisible = visibleRows.filter((r) => r.status === 'new');
  const selectedVisible = selectableVisible.filter((r) => selected.has(r.rowId));
  const allVisibleSelected = selectableVisible.length > 0 && selectedVisible.length === selectableVisible.length;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      {/* Filter tabs dengan hitungan */}
      <div className="tabs">
        {PREVIEW_TABS.map((t) => {
          const count = rows.filter(t.filter).length;
          if (count === 0 && t.key !== 'new') return null;
          return (
            <button
              key={t.key}
              className={activeTab === t.key ? 'active' : ''}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Kotak cari + tombol pilih/kosongkan */}
      <div className="row wrap" style={{ marginBottom: 10, marginTop: 10 }}>
        <input
          placeholder="Cari nama/nomor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        {selectableVisible.length > 0 && (
          <button className="secondary" onClick={() => onToggleAll(selectableVisible, allVisibleSelected)}>
            {allVisibleSelected
              ? `Kosongkan pilihan (${selectedVisible.length})`
              : `Pilih semua yang tampil (${selectableVisible.length})`}
          </button>
        )}
      </div>

      {/* Tabel */}
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              <th>Nama</th>
              <th>Nomor</th>
              <th className="col-hide-mobile">Login CITA</th>
              <th className="col-hide-mobile">Grup</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const canSelect = r.status === 'new';
              return (
                <tr key={r.rowId} style={{ opacity: r.status === 'exists' ? 0.55 : 1 }}>
                  <td>
                    {canSelect && (
                      <input
                        type="checkbox"
                        checked={selected.has(r.rowId)}
                        onChange={() => onToggle(r.rowId)}
                      />
                    )}
                  </td>
                  <td>{r.name || <span className="muted">—</span>}</td>
                  <td className="muted">{r.normalizedPhone || r.phone}</td>
                  <td className="muted col-hide-mobile">{r.loginCita || '—'}</td>
                  <td className="muted col-hide-mobile">{r.group || '—'}</td>
                  <td>
                    <span className={`badge ${STATUS_CLASS[r.status] || 'gray'}`}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                    {r.warnings?.map((w) => (
                      <span key={w} className="badge yellow" style={{ marginLeft: 4, fontSize: 11 }}>
                        {WARN_LABEL[w] || w}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 12 }}>
                  Tidak ada data di tab ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Google ──────────────────────────────────────────────────────────────

function TabGoogle({ onPreview }) {
  const showToast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [tokenError, setTokenError] = useState(false);

  async function loadStatus() {
    setLoadingStatus(true);
    try {
      const s = await api.contactsGoogleStatus();
      setStatus(s);
      setTokenError(false);
    } catch {
      setStatus({ connected: false, email: null });
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => {
    const google = searchParams.get('google');
    const reason = searchParams.get('reason') || '';
    if (google === 'ok') {
      showToast('success', 'Google Contacts berhasil dihubungkan.');
      setSearchParams({}, { replace: true });
    } else if (google === 'error') {
      const msg =
        reason === 'no_refresh_token'
          ? 'Gagal menghubungkan: Google tidak memberikan izin permanen. Coba lagi dan pastikan klik "Izinkan".'
          : reason === 'state_invalid'
          ? 'Sesi koneksi kedaluwarsa (> 10 menit). Coba klik tombol Hubungkan lagi.'
          : `Gagal menghubungkan Google Contacts: ${reason || 'error tidak diketahui'}`;
      showToast('error', msg);
      setSearchParams({}, { replace: true });
    }
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect() {
    try {
      const { url } = await api.contactsGoogleGetConnectUrl();
      window.location.href = url;
    } catch (err) {
      showToast('error', 'Gagal memulai koneksi Google: ' + err.message);
    }
  }

  async function handleDisconnect() {
    try {
      await api.contactsGoogleDisconnect();
      showToast('success', 'Koneksi Google Contacts diputus.');
      setStatus({ connected: false, email: null });
      setTokenError(false);
    } catch (err) {
      showToast('error', err.message);
    }
  }

  async function handlePull() {
    setPulling(true);
    setTokenError(false);
    try {
      const data = await api.contactsGooglePreview();

      // Gabung suggested + other jadi "baru", dedup by normalizedPhone client-side
      const seenPhones = new Set();
      const freshRows = [];
      for (const c of [...(data.suggested || []), ...(data.other || [])]) {
        if (seenPhones.has(c.phone)) {
          freshRows.push({ name: c.name, phone: c.phone, normalizedPhone: c.phone,
            loginCita: null, group: null, googleContactId: c.googleContactId,
            status: 'duplicate_in_batch', warnings: [] });
        } else {
          seenPhones.add(c.phone);
          freshRows.push({ name: c.name, phone: c.phone, normalizedPhone: c.phone,
            loginCita: null, group: null, googleContactId: c.googleContactId,
            status: 'new', warnings: [] });
        }
      }
      const existsRows = (data.alreadyImported || []).map((c) => ({
        name: c.name, phone: c.phone, normalizedPhone: c.phone,
        loginCita: null, group: null, googleContactId: c.googleContactId,
        status: 'exists', warnings: [],
      }));

      onPreview([...freshRows, ...existsRows], 'google', /*resetSelection=*/ true);
    } catch (err) {
      if (err.code === 'GOOGLE_RECONNECT_REQUIRED') {
        setTokenError(true);
        setStatus({ connected: false, email: null });
      } else {
        showToast('error', err.message);
      }
    } finally {
      setPulling(false);
    }
  }

  if (loadingStatus) return <p className="muted">Mengecek status Google Contacts...</p>;

  return (
    <div>
      <div className="card">
        {tokenError ? (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>Token Google Contacts kadaluwarsa atau dicabut.</p>
            <button onClick={handleConnect}>Hubungkan ulang Google</button>
          </div>
        ) : status?.connected ? (
          <div className="row wrap" style={{ alignItems: 'center' }}>
            <span>Terhubung sebagai <strong>{status.email || '—'}</strong></span>
            <div style={{ flex: 1 }} />
            <button className="secondary" onClick={handleDisconnect}>Putuskan</button>
          </div>
        ) : (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>Belum terhubung ke Google Contacts.</p>
            <button onClick={handleConnect}>Hubungkan Google Contacts</button>
          </div>
        )}
      </div>

      {status?.connected && !tokenError && (
        <div className="card">
          <button onClick={handlePull} disabled={pulling}>
            {pulling ? 'Menarik kontak...' : 'Tarik Kontak Google'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Excel ───────────────────────────────────────────────────────────────

function TabExcel({ onPreview }) {
  const showToast = useToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  async function handleDownloadTemplate() {
    try {
      const blob = await api.contactsExcelTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'template-import-outlet.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast('error', 'Gagal download template: ' + err.message);
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('error', 'File terlalu besar. Maksimal 2 MB.');
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const data = await api.contactsUploadExcel(file);
      onPreview(data.rows, 'excel', /*resetSelection=*/ true);
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Download template, isi data outlet, lalu upload kembali.
          Kolom <strong>no_hp</strong> sudah diformat Text — ketik nomor apa adanya.
        </p>
        <button className="secondary" onClick={handleDownloadTemplate}>
          Download Template Excel
        </button>
      </div>
      <div className="card">
        <label>Upload File Excel (.xlsx, maks. 2 MB / 2.000 baris)</label>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFileChange}
          disabled={uploading}
          style={{ marginTop: 8 }}
        />
        {uploading && <p className="muted" style={{ marginTop: 8 }}>Memproses file...</p>}
      </div>
    </div>
  );
}

// ─── Tab: Manual ──────────────────────────────────────────────────────────────

function TabManual({ onPreview }) {
  const showToast = useToast();
  const [mode, setMode] = useState('single');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loginCita, setLoginCita] = useState('');
  const [group, setGroup] = useState('');
  const [multiText, setMultiText] = useState('');
  const [previewing, setPreviewing] = useState(false);

  async function handlePreviewClick() {
    let rows = [];
    if (mode === 'single') {
      if (!name.trim() && !phone.trim()) { showToast('error', 'Isi nama dan nomor dulu.'); return; }
      rows = [{ name: name.trim(), phone: phone.trim(), loginCita: loginCita.trim() || null, group: group.trim() || null }];
    } else {
      const lines = multiText.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) { showToast('error', 'Tempel minimal satu baris data.'); return; }
      for (const line of lines) {
        const ci = line.indexOf(',');
        rows.push(ci === -1
          ? { name: line, phone: '', loginCita: null, group: null }
          : { name: line.slice(0, ci).trim(), phone: line.slice(ci + 1).trim(), loginCita: null, group: null });
      }
    }
    setPreviewing(true);
    try {
      const data = await api.contactsPreviewManual(rows);
      onPreview(data.rows, 'manual', /*resetSelection=*/ true);
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="card">
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <button className={mode === 'single' ? '' : 'secondary'} onClick={() => setMode('single')}>Satu Outlet</button>
        <button className={mode === 'multi' ? '' : 'secondary'} onClick={() => setMode('multi')}>Tempel Banyak</button>
      </div>
      {mode === 'single' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>Nama Outlet</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Toko Maju Jaya" />
          </div>
          <div className="field">
            <label>Nomor WA</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08123..." />
          </div>
          <div className="field">
            <label>No. Login CITA (opsional)</label>
            <input value={loginCita} onChange={(e) => setLoginCita(e.target.value)} placeholder="082..." />
          </div>
          <div className="field">
            <label>Grup (opsional)</label>
            <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Prioritas" />
          </div>
        </div>
      ) : (
        <div className="field">
          <label>Tempel data (format: <code>nama, nomor</code> per baris)</label>
          <textarea
            value={multiText}
            onChange={(e) => setMultiText(e.target.value)}
            rows={8}
            placeholder={'Toko Maju Jaya, 081234567890\nWarung Bu Siti, 082198765432'}
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13 }}
          />
        </div>
      )}
      <button style={{ marginTop: 8 }} onClick={handlePreviewClick} disabled={previewing}>
        {previewing ? 'Memproses...' : 'Preview'}
      </button>
    </div>
  );
}

// ─── Halaman utama ────────────────────────────────────────────────────────────

export default function ContactsImport() {
  const showToast = useToast();
  const [activeTab, setActiveTab] = useState('google');
  const [previewRows, setPreviewRows] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);

  // Tambahkan rowId unik ke tiap baris, lalu set centang default sesuai source
  function handlePreview(rawRows, source, resetSelection) {
    const rows = rawRows.map((r, i) => ({ ...r, rowId: `r${i}` }));
    setPreviewRows(rows);
    if (resetSelection) {
      if (source === 'google') {
        // Google: tidak ada yang tercentang secara default
        setSelected(new Set());
      } else {
        // Excel / Manual: centang semua baris baru
        setSelected(new Set(rows.filter((r) => r.status === 'new').map((r) => r.rowId)));
      }
    }
  }

  function handleToggle(rowId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  // rows = subset baris yang tampil sekarang (setelah filter tab + search)
  function handleToggleAll(rows, currentlyAllSelected) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (currentlyAllSelected) rows.forEach((r) => next.delete(r.rowId));
      else rows.forEach((r) => next.add(r.rowId));
      return next;
    });
  }

  function handleCancel() {
    setPreviewRows(null);
    setSelected(new Set());
  }

  async function handleImport() {
    if (!previewRows) return;
    const toImport = previewRows.filter((r) => r.status === 'new' && selected.has(r.rowId));
    if (toImport.length === 0) { showToast('error', 'Pilih minimal satu kontak baru dulu.'); return; }
    setImporting(true);
    try {
      const res = await api.contactsImport(toImport, null);
      showToast('success', `${res.imported} outlet tersimpan.`);
      setPreviewRows(null);
      setSelected(new Set());
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setImporting(false);
    }
  }

  // Hitung dari seluruh rows (bukan hanya yang tampil di tab/filter saat ini)
  const selectedCount = previewRows
    ? previewRows.filter((r) => r.status === 'new' && selected.has(r.rowId)).length
    : 0;

  return (
    <div>
      <h2>Import Kontak Outlet</h2>

      {/* Tab sumber — beralih tab TIDAK menghapus preview */}
      <div className="tabs">
        <button className={activeTab === 'google' ? 'active' : ''} onClick={() => setActiveTab('google')}>
          Google Contacts
        </button>
        <button className={activeTab === 'excel' ? 'active' : ''} onClick={() => setActiveTab('excel')}>
          Excel
        </button>
        <button className={activeTab === 'manual' ? 'active' : ''} onClick={() => setActiveTab('manual')}>
          Manual
        </button>
      </div>

      {activeTab === 'google' && <TabGoogle onPreview={handlePreview} />}
      {activeTab === 'excel' && <TabExcel onPreview={handlePreview} />}
      {activeTab === 'manual' && <TabManual onPreview={handlePreview} />}

      {/* Preview + tombol import */}
      {previewRows && (
        <>
          <PreviewTable
            rows={previewRows}
            selected={selected}
            onToggle={handleToggle}
            onToggleAll={handleToggleAll}
          />
          <div style={{ marginTop: 12 }}>
            <button onClick={handleImport} disabled={importing || selectedCount === 0}>
              {importing ? 'Menyimpan...' : `Simpan ${selectedCount} kontak terpilih`}
            </button>
            <button className="secondary" style={{ marginLeft: 8 }} onClick={handleCancel}>
              Batal
            </button>
          </div>
        </>
      )}
    </div>
  );
}
