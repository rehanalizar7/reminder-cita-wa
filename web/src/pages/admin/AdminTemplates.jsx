import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast.jsx';
import { PlaceholderHelp } from '../Templates.jsx';

const EMPTY = { name: '', body: '' };

// Template bersama: dibuat admin, muncul di daftar template semua REE & SPV
// (ditandai "Bersama"), gak bisa diubah/dihapus selain dari sini.
export default function AdminTemplates() {
  const showToast = useToast();
  const [templates, setTemplates] = useState([]);
  const [placeholders, setPlaceholders] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);

  async function load() {
    const res = await api.adminTemplates();
    setTemplates(res.templates);
    setPlaceholders(res.availablePlaceholders);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  function reset() {
    setEditingId(null);
    setForm(EMPTY);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.body.trim()) return showToast('error', 'Nama dan isi template wajib diisi.');
    setSaving(true);
    try {
      if (editingId) await api.adminUpdateTemplate(editingId, form);
      else await api.adminCreateTemplate(form);
      showToast('success', editingId ? 'Template bersama diperbarui.' : 'Template bersama ditambahkan.');
      reset();
      await load();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(t) {
    if (!confirm(`Hapus template bersama "${t.name}"? Template ini hilang dari daftar semua REE & SPV.`)) return;
    try {
      await api.adminDeleteTemplate(t.id);
      if (editingId === t.id) reset();
      showToast('success', 'Template bersama dihapus.');
      await load();
    } catch (err) {
      showToast('error', err.message);
    }
  }

  return (
    <div>
      <h2>Template Bersama</h2>
      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit Template Bersama' : 'Template Bersama Baru'}</h3>
        <PlaceholderHelp placeholders={placeholders} />
        <form onSubmit={submit}>
          <div className="field">
            <label>Nama template</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Reminder Order Mingguan" />
          </div>
          <div className="field">
            <label>Isi pesan</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Halo {{nama_outlet}}, jangan lupa order rutin via CITA ya. Login pakai nomor {{no_login_cita}}. - {{nama_ree}}"
            />
          </div>
          <div className="row">
            <button type="submit" disabled={saving}>
              {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Template'}
            </button>
            {editingId && (
              <button type="button" className="secondary" onClick={reset}>
                Batal
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Daftar Template Bersama ({templates.length})</h3>
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th className="col-hide-mobile">Isi pesan</th>
              <th className="num col-hide-mobile">Dipakai jadwal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr
                key={t.id}
                className="clickable-row"
                onClick={(e) => {
                  if (e.target.closest('button')) return;
                  setDetail(t);
                }}
              >
                <td className="nowrap">{t.name}</td>
                <td className="muted col-hide-mobile">{t.body}</td>
                <td className="num col-hide-mobile">{t.scheduleCount}</td>
                <td>
                  <div className="row">
                    <button
                      className="secondary"
                      onClick={() => {
                        setEditingId(t.id);
                        setForm({ name: t.name, body: t.body });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Edit
                    </button>
                    <button className="secondary" onClick={() => remove(t)}>
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Belum ada template bersama.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>{detail.name}</h3>
            <div className="modal-field">
              <div className="modal-label">Isi pesan</div>
              <div className="modal-value">{detail.body}</div>
            </div>
            <div className="modal-field">
              <div className="modal-label">Dipakai jadwal</div>
              <div className="modal-value">{detail.scheduleCount}</div>
            </div>
            <button className="secondary" style={{ width: '100%' }} onClick={() => setDetail(null)}>
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
