import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast.jsx';
import { useMe } from '../lib/me.jsx';
import { loadTargetData, groupOptionLabel, outletOptionLabel, targetLabel } from '../lib/targets.jsx';
import { DAY_NAMES, DAY_ORDER, buildCron, describeSchedule, describeCron, isOddHour } from '../lib/cronText.js';

const FREQS = [
  ['daily', 'Tiap hari'],
  ['weekly', 'Hari tertentu tiap minggu'],
  ['monthly', 'Tanggal tertentu tiap bulan'],
];
// Tanggal 29-31 gak dikasih, biar gak ada bulan yang kelewat (Februari dll).
const DATES = Array.from({ length: 28 }, (_, i) => i + 1);

function formatWhen(d) {
  return new Date(d).toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function whenLabel(s) {
  return s.isRecurring ? describeCron(s.cronExpression) : new Date(s.runAt).toLocaleString('id-ID');
}

export default function Schedules() {
  const showToast = useToast();
  const { me } = useMe();
  const isSpv = me?.role === 'spv';
  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [members, setMembers] = useState([]);
  const [schedules, setSchedules] = useState([]);

  const [templateId, setTemplateId] = useState('');
  const [targetType, setTargetType] = useState('ALL');
  const [groupId, setGroupId] = useState('');
  const [targetReeId, setTargetReeId] = useState('');
  const [selectedOutlets, setSelectedOutlets] = useState(new Set());

  const [mode, setMode] = useState('once'); // 'once' | 'recurring'
  const [runAt, setRunAt] = useState('');
  const [time, setTime] = useState('09:00');
  const [freq, setFreq] = useState('weekly');
  const [days, setDays] = useState(new Set([1])); // default Senin
  const [dates, setDates] = useState(new Set([1]));

  // formError: validasi form sebelum submit, ditampilkan inline di atas tombol.
  // Semua feedback aksi lain (sukses/gagal) pakai toast agar tidak ada duplikat.
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailSchedule, setDetailSchedule] = useState(null);

  function handleRowClick(e, s) {
    if (e.target.closest('button, input, select, a, label')) return;
    setDetailSchedule(s);
  }

  async function loadAll() {
    const [t, data, s] = await Promise.all([api.templates(), loadTargetData(isSpv, { activeOnly: false }), api.schedules()]);
    setTemplates(t.templates);
    setGroups(data.groups);
    setOutlets(data.outlets);
    setMembers(data.members);
    setSchedules(s);
  }

  useEffect(() => {
    loadAll().catch((err) => showToast('error', 'Gagal memuat data: ' + err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleDay(d) {
    setDays((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  }

  function toggleDate(d) {
    setDates((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  }

  const recurring = { freq, time, days: [...days], dates: [...dates] };
  const recurringReady =
    Boolean(time) && (freq === 'daily' || (freq === 'weekly' && days.size > 0) || (freq === 'monthly' && dates.size > 0));

  async function handleCreate(e) {
    e.preventDefault();
    setFormError('');
    if (!templateId) return setFormError('Pilih template dulu.');
    if (targetType === 'GROUP' && !groupId) return setFormError('Pilih grup dulu.');
    if (targetType === 'REE' && !targetReeId) return setFormError('Pilih REE dulu.');
    if (targetType === 'SELECTED' && selectedOutlets.size === 0) return setFormError('Pilih minimal satu outlet.');
    if (mode === 'once' && !runAt) return setFormError('Tentukan tanggal & jam kirim.');
    if (mode === 'once' && new Date(runAt) <= new Date()) return setFormError('Tanggal & jam kirim udah lewat.');
    if (mode === 'recurring' && !time) return setFormError('Tentukan jam kirim.');
    if (mode === 'recurring' && freq === 'weekly' && days.size === 0) return setFormError('Pilih minimal satu hari.');
    if (mode === 'recurring' && freq === 'monthly' && dates.size === 0) return setFormError('Pilih minimal satu tanggal.');

    setSaving(true);
    try {
      const body = { templateId, targetType };
      if (targetType === 'GROUP') body.groupId = groupId;
      if (targetType === 'REE') body.targetReeId = targetReeId;
      if (targetType === 'SELECTED') body.outletIds = [...selectedOutlets];

      if (mode === 'once') {
        body.runAt = new Date(runAt).toISOString();
      } else {
        body.isRecurring = true;
        body.cronExpression = buildCron(recurring);
      }

      await api.createSchedule(body);
      showToast('success', 'Jadwal berhasil dibuat.');
      await loadAll();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(s) {
    try {
      await api.toggleSchedule(s.id, !s.isActive);
      showToast('success', s.isActive ? 'Jadwal dinonaktifkan.' : 'Jadwal diaktifkan.');
      await loadAll();
    } catch (err) {
      showToast('error', err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Hapus jadwal ini?')) return;
    try {
      await api.deleteSchedule(id);
      // Optimistic: hapus langsung dari state tanpa tunggu refetch
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      showToast('success', 'Jadwal berhasil dihapus.');
    } catch (err) {
      showToast('error', err.message);
    }
  }

  async function handleRunNow(id) {
    if (!confirm('Jalankan jadwal ini sekarang juga?')) return;
    try {
      const res = await api.runScheduleNow(id);
      showToast('success', `${res.queued} pesan masuk antrian kirim.`);
      await loadAll();
    } catch (err) {
      showToast('error', err.message);
    }
  }

  return (
    <div>
      <h2>Jadwal Reminder</h2>

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
                  {outletOptionLabel(o, isSpv)}
                  {!o.isActive && <span className="badge gray" style={{ marginLeft: 6 }}>nonaktif</span>}
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
              <label>Seberapa sering</label>
              <select value={freq} onChange={(e) => setFreq(e.target.value)} style={{ marginBottom: 10 }}>
                {FREQS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              {freq === 'weekly' && (
                <div className="row wrap" style={{ marginBottom: 10 }}>
                  {DAY_ORDER.map((d) => (
                    <label key={d} className="checkbox-row">
                      <input type="checkbox" checked={days.has(d)} onChange={() => toggleDay(d)} />
                      {DAY_NAMES[d]}
                    </label>
                  ))}
                </div>
              )}

              {freq === 'monthly' && (
                <div className="row wrap" style={{ marginBottom: 10, gap: 6 }}>
                  {DATES.map((d) => (
                    <label key={d} className="checkbox-row" style={{ minWidth: 44 }}>
                      <input type="checkbox" checked={dates.has(d)} onChange={() => toggleDate(d)} />
                      {d}
                    </label>
                  ))}
                </div>
              )}

              <div style={{ maxWidth: 140 }}>
                <label>Jam (WIB)</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>

              {recurringReady && (
                <div className="info-box" style={{ marginTop: 10, marginBottom: 0 }}>
                  Pesan bakal dikirim: <strong>{describeSchedule(recurring)}</strong>
                </div>
              )}
              {time && isOddHour(time) && (
                <div className="warn-box" style={{ marginTop: 8, marginBottom: 0 }}>
                  Jam {time} itu {Number(time.split(':')[0]) < 6 ? 'subuh' : 'malam'}, di luar jam buka toko pada umumnya.
                  Pastikan jamnya udah bener. Kalau maksudnya sore, pilih jam 16:00 (04:00 PM).
                </div>
              )}
            </div>
          )}

          {formError && <div className="error-box" style={{ marginBottom: 8 }}>{formError}</div>}
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
                <td className="muted col-hide-mobile">{targetLabel(s, isSpv)}</td>
                <td className="muted col-hide-mobile">
                  {whenLabel(s)}
                  {s.nextRunAt && <div>Berikutnya: {formatWhen(s.nextRunAt)}</div>}
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
              <div className="modal-value">{targetLabel(detailSchedule, isSpv)}</div>
            </div>

            <div className="modal-field">
              <div className="modal-label">Waktu</div>
              <div className="modal-value">
                {whenLabel(detailSchedule)}
              </div>
            </div>

            {detailSchedule.nextRunAt && (
              <div className="modal-field">
                <div className="modal-label">Kirim berikutnya</div>
                <div className="modal-value">{formatWhen(detailSchedule.nextRunAt)}</div>
              </div>
            )}

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
