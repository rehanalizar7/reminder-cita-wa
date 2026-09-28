import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast.jsx';

const STATUS_BADGE = { PENDING: 'yellow', SENT: 'green', FAILED: 'red' };

export default function Send() {
  const showToast = useToast();
  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [history, setHistory] = useState([]);

  const [templateId, setTemplateId] = useState('');
  const [targetType, setTargetType] = useState('ALL');
  const [groupId, setGroupId] = useState('');
  const [selectedOutlets, setSelectedOutlets] = useState(new Set());
  const [outletSearch, setOutletSearch] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  async function loadAll() {
    const [t, g, o, h] = await Promise.all([
      api.templates(),
      api.groups(),
      api.outlets({ limit: 500, isActive: 'true' }),
      api.sendHistory({ limit: 30 }),
    ]);
    setTemplates(t.templates);
    setGroups(g);
    setOutlets(o.items);
    setHistory(h);
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err.message));
  }, []);

  const filteredOutlets = useMemo(() => {
    if (!outletSearch.trim()) return outlets;
    const q = outletSearch.toLowerCase();
    return outlets.filter((o) => o.name.toLowerCase().includes(q) || o.phone.includes(q));
  }, [outlets, outletSearch]);

  function toggleOutlet(id) {
    setSelectedOutlets((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const targetCount =
    targetType === 'ALL' ? outlets.length : targetType === 'GROUP' ? groups.find((g) => g.id === groupId)?.outletCount || 0 : selectedOutlets.size;

  async function handleSend() {
    setError('');
    setSuccess('');
    if (!templateId) return setError('Pilih template dulu.');
    if (targetType === 'GROUP' && !groupId) return setError('Pilih grup dulu.');
    if (targetType === 'SELECTED' && selectedOutlets.size === 0) return setError('Pilih minimal satu outlet.');

    if (!confirm(`Kirim ke ${targetCount} outlet sekarang?`)) return;

    setSending(true);
    try {
      const body = { templateId, targetType };
      if (targetType === 'GROUP') body.groupId = groupId;
      if (targetType === 'SELECTED') body.outletIds = [...selectedOutlets];
      const res = await api.sendNow(body);
      const msg = `${res.queued} pesan masuk antrian kirim. Cek status di riwayat & Dashboard.`;
      setSuccess(msg);
      showToast('success', msg);
      const h = await api.sendHistory({ limit: 30 });
      setHistory(h);
    } catch (err) {
      setError(err.message);
      showToast('error', err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h2>Kirim Reminder</h2>
      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="card">
        <div className="field">
          <label>Template</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">-- pilih template --</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Kirim ke</label>
          <div className="row wrap">
            <label className="checkbox-row">
              <input type="radio" checked={targetType === 'ALL'} onChange={() => setTargetType('ALL')} /> Semua outlet
            </label>
            <label className="checkbox-row">
              <input type="radio" checked={targetType === 'GROUP'} onChange={() => setTargetType('GROUP')} /> Per grup
            </label>
            <label className="checkbox-row">
              <input type="radio" checked={targetType === 'SELECTED'} onChange={() => setTargetType('SELECTED')} /> Pilih outlet
            </label>
          </div>
        </div>

        {targetType === 'GROUP' && (
          <div className="field">
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">-- pilih grup --</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.outletCount} outlet)
                </option>
              ))}
            </select>
          </div>
        )}

        {targetType === 'SELECTED' && (
          <div className="field">
            <input placeholder="Cari outlet..." value={outletSearch} onChange={(e) => setOutletSearch(e.target.value)} style={{ marginBottom: 8 }} />
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
              {filteredOutlets.map((o) => (
                <label key={o.id} className="checkbox-row" style={{ padding: '4px 0' }}>
                  <input type="checkbox" checked={selectedOutlets.has(o.id)} onChange={() => toggleOutlet(o.id)} />
                  {o.name} <span className="muted">({o.phone})</span>
                </label>
              ))}
              {filteredOutlets.length === 0 && <span className="muted">Tidak ada outlet cocok.</span>}
            </div>
          </div>
        )}

        <p className="muted">Target saat ini: {targetCount} outlet</p>
        <button onClick={handleSend} disabled={sending}>
          {sending ? 'Mengirim...' : 'Kirim Sekarang'}
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Riwayat Terkirim</h3>
        <p className="muted" style={{ marginTop: -8 }}>Klik baris buat lihat detail lengkapnya.</p>
        <table>
          <thead>
            <tr>
              <th>Outlet</th>
              <th className="col-hide-mobile">Pesan</th>
              <th>Status</th>
              <th>Waktu</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className="clickable-row" onClick={() => setSelectedLog(h)}>
                <td>
                  {h.outletName}
                  <div className="muted">{h.phone}</div>
                </td>
                <td className="muted col-hide-mobile" style={{ maxWidth: 320 }}>
                  {h.message}
                </td>
                <td>
                  <span className={`badge ${STATUS_BADGE[h.status] || 'gray'}`}>{h.status}</span>
                  {h.error && <div className="muted">{h.error}</div>}
                </td>
                <td className="muted">{new Date(h.createdAt).toLocaleString('id-ID')}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Belum ada riwayat kirim.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Detail Pengiriman</h3>

            <div className="modal-field">
              <div className="modal-label">Outlet</div>
              <div className="modal-value">{selectedLog.outletName}</div>
            </div>

            <div className="modal-field">
              <div className="modal-label">No. HP</div>
              <div className="modal-value">{selectedLog.phone}</div>
            </div>

            <div className="modal-field">
              <div className="modal-label">Status</div>
              <div className="modal-value">
                <span className={`badge ${STATUS_BADGE[selectedLog.status] || 'gray'}`}>{selectedLog.status}</span>
              </div>
            </div>

            {selectedLog.error && (
              <div className="modal-field">
                <div className="modal-label">Error</div>
                <div className="modal-value muted">{selectedLog.error}</div>
              </div>
            )}

            <div className="modal-field">
              <div className="modal-label">Waktu</div>
              <div className="modal-value">{new Date(selectedLog.createdAt).toLocaleString('id-ID')}</div>
            </div>

            <div className="modal-field">
              <div className="modal-label">Isi Pesan</div>
              <div className="modal-value">{selectedLog.message}</div>
            </div>

            <button className="secondary" style={{ width: '100%' }} onClick={() => setSelectedLog(null)}>
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
