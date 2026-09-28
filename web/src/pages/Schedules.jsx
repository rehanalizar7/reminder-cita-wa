import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast.jsx';

const DAYS = [
  { value: 1, label: 'Sen' },
  { value: 2, label: 'Sel' },
  { value: 3, label: 'Rab' },
  { value: 4, label: 'Kam' },
  { value: 5, label: 'Jum' },
  { value: 6, label: 'Sab' },
  { value: 0, label: 'Min' },
];

export default function Schedules() {
  const showToast = useToast();
  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [schedules, setSchedules] = useState([]);

  const [templateId, setTemplateId] = useState('');
  const [targetType, setTargetType] = useState('ALL');
  const [groupId, setGroupId] = useState('');
  const [selectedOutlets, setSelectedOutlets] = useState(new Set());

  const [mode, setMode] = useState('once'); // 'once' | 'recurring'
  const [runAt, setRunAt] = useState('');
  const [time, setTime] = useState('09:00');
  const [days, setDays] = useState(new Set([1])); // default Senin
  const [rawCron, setRawCron] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailSchedule, setDetailSchedule] = useState(null);

  function handleRowClick(e, s) {
    if (e.target.closest('button, input, select, a, label')) return;
    setDetailSchedule(s);
  }

  async function loadAll() {
    const [t, g, o, s] = await Promise.all([api.templates(), api.groups(), api.outlets({ limit: 500 }), api.schedules()]);
    setTemplates(t.templates);
    setGroups(g);
    setOutlets(o.items);
    setSchedules(s);
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err.message));
  }, []);

  function toggleDay(d) {
    setDays((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  }

  function buildCron() {
    if (rawCron.trim()) return rawCron.trim();
    const [hh, mm] = time.split(':');
    const dayList = [...days].sort().join(',') || '*';
    return `${Number(mm)} ${Number(hh)} * * ${dayList}`;
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!templateId) return setError('Pilih template dulu.');
    if (targetType === 'GROUP' && !groupId) return setError('Pilih grup dulu.');
    if (targetType === 'SELECTED' && selectedOutlets.size === 0) return setError('Pilih minimal satu outlet.');
    if (mode === 'once' && !runAt) return setError('Tentukan tanggal & jam kirim.');

    setSaving(true);
    try {
      const body = { templateId, targetType };
      if (targetType === 'GROUP') body.groupId = groupId;
      if (targetType === 'SELECTED') body.outletIds = [...selectedOutlets];

      if (mode === 'once') {
        body.runAt = new Date(runAt).toISOString();
      } else {
        body.isRecurring = true;
        body.cronExpression = buildCron();
      }

      await api.createSchedule(body);
      setSuccess('Jadwal berhasil dibuat.');
      showToast('success', 'Jadwal berhasil dibuat.');
      await loadAll();
    } catch (err) {
      setError(err.message);
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(s) {
    try {
      await api.toggleSchedule(s.id, !s.isActive);
      loadAll();
      showToast('success', s.isActive ? 'Jadwal dinonaktifkan.' : 'Jadwal diaktifkan.');
    } catch (err) {
      showToast('error', err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Hapus jadwal ini?')) return;
    try {
      await api.deleteSchedule(id);
      loadAll();
      showToast('success', 'Jadwal berhasil dihapus.');
    } catch (err) {
      showToast('error', err.message);
    }
  }

  async function handleRunNow(id) {
    if (!confirm('Jalankan jadwal ini sekarang juga?')) return;
    try {
      const res = await api.runScheduleNow(id);
      const msg = `${res.queued} pesan masuk antrian kirim.`;
      setSuccess(msg);
      showToast('success', msg);
      loadAll();
    } catch (err) {
      showToast('error', err.message);
    }
  }

  return (
    <div>
      <h2>Jadwal Reminder</h2>
      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Buat Jadwal Baru</h3>
        <form onSubmit={handleCreate}>
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
            <div className="field" style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
              {outlets.map((o) => (
                <label key={o.id} className="checkbox-row" style={{ padding: '3px 0' }}>
                  <input
                    type="checkbox"
                    checked={selectedOutlets.has(o.id)}
                    onChange={() =>
                      setSelectedOutlets((prev) => {
                        const next = new Set(prev);
                        next.has(o.id) ? next.delete(o.id) : next.add(o.id);
                        return next;
                      })
                    }
                  />
                  {o.name}
                </label>
              ))}
            </div>
          )}

          <div className="field">
            <label>Waktu kirim</label>
            <div className="row wrap">
              <label className="checkbox-row">
                <input type="radio" checked={mode === 'once'} onChange={() => setMode('once')} /> Sekali kirim
              </label>
              <label className="checkbox-row">
                <input type="radio" checked={mode === 'recurring'} onChange={() => setMode('recurring')} /> Berulang
              </label>
            </div>
          </div>

          {mode === 'once' ? (
            <div className="field">
              <input type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)} />
            </div>
          ) : (
            <div className="field">
              <div className="row wrap" style={{ marginBottom: 8 }}>
                {DAYS.map((d) => (
                  <label key={d.value} className="checkbox-row">
                    <input type="checkbox" checked={days.has(d.value)} onChange={() => toggleDay(d.value)} />
                    {d.label}
                  </label>
                ))}
              </div>
              <div className="row wrap">
                <div style={{ maxWidth: 140 }}>
                  <label>Jam</label>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>
              <p className="muted" style={{ marginTop: 8 }}>
                Cron otomatis: <code>{buildCron()}</code> (opsional, timpa manual kalau perlu)
              </p>
              <input placeholder="Cron lanjutan (opsional), mis. 0 9 1 * *" value={rawCron} onChange={(e) => setRawCron(e.target.value)} />
            </div>
          )}

          <button type="submit" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Buat Jadwal'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Daftar Jadwal</h3>
        <table>
          <thead>
            <tr>
              <th>Template</th>
              <th className="col-hide-mobile">Target</th>
              <th className="col-hide-mobile">Waktu</th>
              <th>Status</th>
              <th className="col-hide-mobile">Terakhir jalan</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => (
              <tr key={s.id} className="clickable-row" onClick={(e) => handleRowClick(e, s)}>
                <td>{s.templateName}</td>
                <td className="muted col-hide-mobile">
                  {s.targetType === 'ALL' ? 'Semua outlet' : s.targetType === 'GROUP' ? `Grup: ${s.groupName}` : 'Outlet terpilih'}
                </td>
                <td className="muted col-hide-mobile">
                  {s.isRecurring ? (
                    <>
                      Berulang <code>{s.cronExpression}</code>
                    </>
                  ) : (
                    new Date(s.runAt).toLocaleString('id-ID')
                  )}
                </td>
                <td>
                  <span className={`badge ${s.isActive ? 'green' : 'gray'}`}>{s.isActive ? 'Aktif' : 'Nonaktif'}</span>
                </td>
                <td className="muted col-hide-mobile">{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString('id-ID') : '-'}</td>
                <td>
                  <div className="row wrap">
                    <button className="secondary" onClick={() => handleRunNow(s.id)}>
                      Jalankan Sekarang
                    </button>
                    <button className="secondary" onClick={() => handleToggle(s)}>
                      {s.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button className="danger" onClick={() => handleDelete(s.id)}>
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {schedules.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Belum ada jadwal.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detailSchedule && (
        <div className="modal-overlay" onClick={() => setDetailSchedule(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>{detailSchedule.templateName}</h3>

            <div className="modal-field">
              <div className="modal-label">Target</div>
              <div className="modal-value">
                {detailSchedule.targetType === 'ALL'
                  ? 'Semua outlet'
                  : detailSchedule.targetType === 'GROUP'
                  ? `Grup: ${detailSchedule.groupName}`
                  : 'Outlet terpilih'}
              </div>
            </div>

            <div className="modal-field">
              <div className="modal-label">Waktu</div>
              <div className="modal-value">
                {detailSchedule.isRecurring ? (
                  <>Berulang: {detailSchedule.cronExpression}</>
                ) : (
                  new Date(detailSchedule.runAt).toLocaleString('id-ID')
                )}
              </div>
            </div>

            <div className="modal-field">
              <div className="modal-label">Status</div>
              <div className="modal-value">
                <span className={`badge ${detailSchedule.isActive ? 'green' : 'gray'}`}>
                  {detailSchedule.isActive ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
            </div>

            <div className="modal-field">
              <div className="modal-label">Terakhir jalan</div>
              <div className="modal-value">
                {detailSchedule.lastRunAt ? new Date(detailSchedule.lastRunAt).toLocaleString('id-ID') : 'Belum pernah'}
              </div>
            </div>

            <button className="secondary" style={{ width: '100%' }} onClick={() => setDetailSchedule(null)}>
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
