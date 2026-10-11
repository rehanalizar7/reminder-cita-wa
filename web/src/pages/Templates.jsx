import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast.jsx';

const EMPTY_FORM = { name: '', body: '' };

const PLACEHOLDER_DESC = {
  nama_outlet: 'nama outlet',
  nama_ree: 'REE pemilik outlet',
  nama_pengirim: 'yang ngirim (kamu sendiri; beda dari nama_ree kalau SPV yang kirim)',
  no_login_cita: 'nomor login CITA outlet (kosong kalau belum diisi REE)',
};

export function PlaceholderHelp({ placeholders }) {
  return (
    <div className="muted" style={{ marginBottom: 12 }}>
      Placeholder yang bisa dipakai:
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        {placeholders.map((p) => (
          <li key={p}>
            <code>{`{{${p}}}`}</code>
            {PLACEHOLDER_DESC[p] ? ` — ${PLACEHOLDER_DESC[p]}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Templates() {
  const showToast = useToast();
  const [templates, setTemplates] = useState([]);
  const [placeholders, setPlaceholders] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailTemplate, setDetailTemplate] = useState(null);

  function handleRowClick(e, t) {
    if (e.target.closest('button, input, select, a, label')) return;
    setDetailTemplate(t);
  }

  async function load() {
    const res = await api.templates();
    setTemplates(res.templates);
    setPlaceholders(res.availablePlaceholders);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  function startEdit(t) {
    setEditingId(t.id);
    setForm({ name: t.name, body: t.body });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.body.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editingId) await api.updateTemplate(editingId, form);
      else await api.createTemplate(form);
      showToast('success', editingId ? 'Template berhasil diperbarui.' : 'Template berhasil ditambahkan.');
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Hapus template ini?')) return;
    try {
      await api.deleteTemplate(id);
      if (editingId === id) resetForm();
      load();
      showToast('success', 'Template berhasil dihapus.');
    } catch (err) {
      setError(err.message);
      showToast('error', err.message);
    }
  }

  return (
    <div>
      <h2>Template Pesan</h2>
      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit Template' : 'Template Baru'}</h3>
        <PlaceholderHelp placeholders={placeholders} />
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Nama template</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Reminder Order CITA Mingguan" />
          </div>
          <div className="field">
            <label>Isi pesan</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Halo {{nama_outlet}}, jangan lupa order rutin via CITA ya. Terima kasih - {{nama_ree}}"
            />
          </div>
          <div className="row">
            <button type="submit" disabled={saving}>
              {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Template'}
            </button>
            {editingId && (
              <button type="button" className="secondary" onClick={resetForm}>
                Batal
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Daftar Template</h3>
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th className="col-hide-mobile">Isi Pesan</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="clickable-row" onClick={(e) => handleRowClick(e, t)}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {t.name}
                  {!t.reeId && <span className="badge gray" style={{ marginLeft: 6 }}>Bersama</span>}
                </td>
                <td className="muted col-hide-mobile">{t.body}</td>
                <td>
                  {t.reeId && (
                    <div className="row">
                      <button className="secondary" onClick={() => startEdit(t)}>
                        Edit
                      </button>
                      <button className="secondary" onClick={() => handleDelete(t.id)}>
                        Hapus
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  Belum ada template.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detailTemplate && (
        <div className="modal-overlay" onClick={() => setDetailTemplate(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>
              {detailTemplate.name}
              {!detailTemplate.reeId && <span className="badge gray" style={{ marginLeft: 6 }}>Bersama</span>}
            </h3>

            <div className="modal-field">
              <div className="modal-label">Isi Pesan</div>
              <div className="modal-value">{detailTemplate.body}</div>
            </div>

            <button className="secondary" style={{ width: '100%' }} onClick={() => setDetailTemplate(null)}>
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
