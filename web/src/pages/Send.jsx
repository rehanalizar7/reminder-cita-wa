import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast.jsx';
import { useMe } from '../lib/me.jsx';
import { loadTargetData, targetSummary, groupOptionLabel, outletOptionLabel } from '../lib/targets.jsx';

const STATUS_BADGE = { PENDING: 'yellow', SENT: 'green', FAILED: 'red' };

export default function Send() {
  const showToast = useToast();
  const { me } = useMe();
  const isSpv = me?.role === 'spv';

  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [members, setMembers] = useState([]);
  const [history, setHistory] = useState([]);

  const [templateId, setTemplateId] = useState('');
  const [targetType, setTargetType] = useState('ALL');
  const [groupId, setGroupId] = useState('');
  const [targetReeId, setTargetReeId] = useState('');
  const [selectedOutlets, setSelectedOutlets] = useState(new Set());
  const [outletSearch, setOutletSearch] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  async function loadAll() {
    const [t, data, h] = await Promise.all([
      api.templates(),
      loadTargetData(isSpv, { activeOnly: true }),
      api.sendHistory({ limit: 30 }),
    ]);
    setTemplates(t.templates);
    setGroups(data.groups);
    setOutlets(data.outlets);
    setMembers(data.members);
    setHistory(h);
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredOutlets = useMemo(() => {
    if (!outletSearch.trim()) return outlets;
    const q = outletSearch.toLowerCase();
    return outlets.filter(
      (o) => o.name.toLowerCase().includes(q) || o.phone.includes(q) || (o.ownerName || '').toLowerCase().includes(q)
    );
  }, [outlets, outletSearch]);

  function toggleOutlet(id) {
    setSelectedOutlets((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const summary = targetSummary({ targetType, outlets, groups, members, groupId, targetReeId, selectedOutlets, isSpv });

  async function handleSend() {
    setError('');
    setSuccess('');
    if (!templateId) return setError('Pilih template dulu.');
    if (targetType === 'GROUP' && !groupId) return setError('Pilih grup dulu.');
    if (targetType === 'REE' && !targetReeId) return setError('Pilih REE dulu.');
    if (targetType === 'SELECTED' && selectedOutlets.size === 0) return setError('Pilih minimal satu outlet.');

    const confirmText = isSpv
      ? `Kirim ke ${summary.count} outlet tim sekarang? Pesan keluar dari nomor WA kamu sendiri.`
      : `Kirim ke ${summary.count} outlet sekarang?`;
    if (!confirm(confirmText)) return;

    setSending(true);
    try {
      const body = { templateId, targetType };
      if (targetType === 'GROUP') body.groupId = groupId;
      if (targetType === 'REE') body.targetReeId = targetReeId;
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

      {isSpv && (
        <div className="info-box">
          Pesan dikirim dari <strong>nomor WA kamu sendiri</strong> ke outlet milik REE di tim kamu, dan dihitung ke batas
          kirim harian kamu. Outlet yang sama mungkin juga dapet reminder dari REE-nya, jadi atur jadwal biar gak
          barengan.
        </div>
      )}

      {isSpv && members.length === 0 && (
        <div className="warn-box">Belum ada REE di tim kamu. Minta admin atur TSUB yang kamu pegang.</div>
      )}

      <div className="card">
        <div className="field">
          <label>Template</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">-- pilih template --</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {!t.reeId ? ' (bersama)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Kirim ke</label>
          <div className="row wrap">
            <label className="checkbox-row">
              <input type="radio" checked={targetType === 'ALL'} onChange={() => setTargetType('ALL')} />{' '}
              {isSpv ? 'Semua outlet tim' : 'Semua outlet'}
            </label>
            {isSpv && (
              <label className="checkbox-row">
                <input type="radio" checked={targetType === 'REE'} onChange={() => setTargetType('REE')} /> Per REE
              </label>
            )}
            <label className="checkbox-row">
              <input type="radio" checked={targetType === 'GROUP'} onChange={() => setTargetType('GROUP')} /> Per grup
            </label>
            <label className="checkbox-row">
              <input type="radio" checked={targetType === 'SELECTED'} onChange={() => setTargetType('SELECTED')} /> Pilih outlet
            </label>
          </div>
        </div>

        {targetType === 'REE' && (
          <div className="field">
            <select value={targetReeId} onChange={(e) => setTargetReeId(e.target.value)}>
              <option value="">-- pilih REE --</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.tsubCode} · {m.name} ({m.outletsActive} outlet aktif)
                </option>
              ))}
            </select>
          </div>
        )}

        {targetType === 'GROUP' && (
          <div className="field">
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">-- pilih grup --</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {groupOptionLabel(g, isSpv)}
                </option>
              ))}
            </select>
          </div>
        )}

        {targetType === 'SELECTED' && (
          <div className="field">
            <input
              placeholder={isSpv ? 'Cari outlet / nomor / nama REE...' : 'Cari outlet...'}
              value={outletSearch}
              onChange={(e) => setOutletSearch(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
              {filteredOutlets.map((o) => (
                <label key={o.id} className="checkbox-row" style={{ padding: '4px 0' }}>
                  <input type="checkbox" checked={selectedOutlets.has(o.id)} onChange={() => toggleOutlet(o.id)} />
                  {outletOptionLabel(o, isSpv)}
                </label>
              ))}
              {filteredOutlets.length === 0 && <span className="muted">Tidak ada outlet cocok.</span>}
            </div>
          </div>
        )}

        <p className="muted">Target saat ini: {summary.text}</p>
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
                  <div className="muted">
                    {h.phone}
                    {isSpv && h.outletOwnerName ? ` · ${h.outletOwnerName}` : ''}
                  </div>
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

            {isSpv && selectedLog.outletOwnerName && (
              <div className="modal-field">
                <div className="modal-label">REE pemilik outlet</div>
                <div className="modal-value">{selectedLog.outletOwnerName}</div>
              </div>
            )}

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
