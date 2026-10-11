import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useMe } from '../lib/me.jsx';
import { WaStatusCard, SafetyCard } from '../components/WaPanel.jsx';

const STATUS_BADGE = { PENDING: 'yellow', SENT: 'green', FAILED: 'red' };

function isToday(date) {
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function isThisWeek(date) {
  return Date.now() - date.getTime() <= 7 * 24 * 60 * 60 * 1000;
}

function isWithinDays(date, days) {
  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

const DATE_RANGES = [
  ['ALL', 'Semua tanggal'],
  ['TODAY', 'Hari ini'],
  ['7D', '7 hari terakhir'],
  ['30D', '30 hari terakhir'],
];

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'barusan';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

export default function Dashboard() {
  const { me } = useMe();
  const [error, setError] = useState('');

  const [outletStats, setOutletStats] = useState(null);
  const [groups, setGroups] = useState([]);
  const [history, setHistory] = useState([]);
  const [schedules, setSchedules] = useState([]);

  const [activityFilter, setActivityFilter] = useState('ALL');
  const [activityDateFilter, setActivityDateFilter] = useState('ALL');
  const [activityLimit, setActivityLimit] = useState(8);
  const [selectedActivity, setSelectedActivity] = useState(null);

  async function loadStats() {
    try {
      const [allOutlets, activeOutlets, g, h, s] = await Promise.all([
        api.outlets({ limit: 1 }),
        api.outlets({ limit: 1, isActive: 'true' }),
        api.groups(),
        api.sendHistory({ limit: 200 }),
        api.schedules(),
      ]);
      setOutletStats({ total: allOutlets.total, active: activeOutlets.total });
      setGroups(g);
      setHistory(h);
      setSchedules(s);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  const todayLogs = history.filter((h) => isToday(new Date(h.createdAt)));
  const weekLogs = history.filter((h) => isThisWeek(new Date(h.createdAt)));
  const countByStatus = (logs, st) => logs.filter((h) => h.status === st).length;

  const upcomingSchedules = schedules
    .filter((s) => s.isActive)
    .sort((a, b) => {
      const at = a.isRecurring ? -Infinity : new Date(a.runAt).getTime();
      const bt = b.isRecurring ? -Infinity : new Date(b.runAt).getTime();
      return at - bt;
    })
    .slice(0, 5);

  const dateFilteredActivity = history.filter((h) => {
    if (activityDateFilter === 'ALL') return true;
    const d = new Date(h.createdAt);
    if (activityDateFilter === 'TODAY') return isToday(d);
    if (activityDateFilter === '7D') return isWithinDays(d, 7);
    if (activityDateFilter === '30D') return isWithinDays(d, 30);
    return true;
  });
  const filteredActivity = dateFilteredActivity.filter((h) => activityFilter === 'ALL' || h.status === activityFilter);
  const recentActivity = filteredActivity.slice(0, activityLimit);

  return (
    <div>
      <h2>Dashboard</h2>
      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <div className="row between">
          <div>
            <div className="muted">Login sebagai</div>
            <div style={{ fontWeight: 600 }}>{me?.name}</div>
            <div className="muted">{me?.email}</div>
          </div>
          {me?.tsubCode && <span className="badge gray">{me.tsubCode}</span>}
        </div>
      </div>

      <WaStatusCard />

      <SafetyCard />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ringkasan Pengiriman</h3>
        <p className="muted" style={{ marginTop: -8 }}>Hari ini</p>
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat-tile stat-ok">
            <div className="stat-value">{countByStatus(todayLogs, 'SENT')}</div>
            <div className="stat-label">Terkirim</div>
          </div>
          <div className="stat-tile stat-danger">
            <div className="stat-value">{countByStatus(todayLogs, 'FAILED')}</div>
            <div className="stat-label">Gagal</div>
          </div>
          <div className="stat-tile stat-warn">
            <div className="stat-value">{countByStatus(todayLogs, 'PENDING')}</div>
            <div className="stat-label">Menunggu</div>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>7 hari terakhir</p>
        <div className="stat-grid">
          <div className="stat-tile stat-ok">
            <div className="stat-value">{countByStatus(weekLogs, 'SENT')}</div>
            <div className="stat-label">Terkirim</div>
          </div>
          <div className="stat-tile stat-danger">
            <div className="stat-value">{countByStatus(weekLogs, 'FAILED')}</div>
            <div className="stat-label">Gagal</div>
          </div>
          <div className="stat-tile stat-warn">
            <div className="stat-value">{countByStatus(weekLogs, 'PENDING')}</div>
            <div className="stat-label">Menunggu</div>
          </div>
        </div>
        {history.length >= 200 && (
          <p className="muted" style={{ marginTop: 10 }}>
            Dihitung dari 200 pengiriman terakhir — kalau volume kirim kamu tinggi, angkanya mungkin belum mewakili
            seluruh minggu ini.
          </p>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Outlet & Grup</h3>
        <div className="stat-grid" style={{ marginBottom: 14 }}>
          <div className="stat-tile">
            <div className="stat-value">{outletStats?.active ?? '-'}</div>
            <div className="stat-label">Outlet aktif</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{outletStats?.total ?? '-'}</div>
            <div className="stat-label">Total outlet</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{groups.length}</div>
            <div className="stat-label">Grup</div>
          </div>
        </div>
        <div className="row wrap">
          {groups.map((g) => (
            <span key={g.id} className="badge gray">
              {g.name} ({g.outletCount})
            </span>
          ))}
          {groups.length === 0 && <span className="muted">Belum ada grup.</span>}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Jadwal Terdekat</h3>
        {upcomingSchedules.length === 0 && <p className="muted">Belum ada jadwal aktif.</p>}
        {upcomingSchedules.map((s) => (
          <div key={s.id} className="list-row">
            <span>
              {s.templateName}
              <span className="muted"> · {s.targetType === 'ALL' ? 'Semua outlet' : s.targetType === 'GROUP' ? s.groupName : 'Outlet terpilih'}</span>
            </span>
            <span className="muted">
              {s.isRecurring ? `Berulang: ${s.cronExpression}` : new Date(s.runAt).toLocaleString('id-ID')}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="row between wrap" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Aktivitas Terakhir</h3>
          <div className="row wrap" style={{ gap: 8 }}>
            <select style={{ width: 160 }} value={activityDateFilter} onChange={(e) => setActivityDateFilter(e.target.value)}>
              {DATE_RANGES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select style={{ width: 120 }} value={activityLimit} onChange={(e) => setActivityLimit(Number(e.target.value))}>
              <option value={5}>5 baris</option>
              <option value={8}>8 baris</option>
              <option value={15}>15 baris</option>
              <option value={30}>30 baris</option>
            </select>
          </div>
        </div>

        <div className="tabs" style={{ marginBottom: 10 }}>
          {[
            ['ALL', 'Semua'],
            ['SENT', 'Terkirim'],
            ['FAILED', 'Gagal'],
            ['PENDING', 'Menunggu'],
          ].map(([value, label]) => (
            <button key={value} className={activityFilter === value ? 'active' : ''} onClick={() => setActivityFilter(value)}>
              {label} ({value === 'ALL' ? dateFilteredActivity.length : dateFilteredActivity.filter((h) => h.status === value).length})
            </button>
          ))}
        </div>

        {recentActivity.length === 0 && <p className="muted">Belum ada riwayat yang cocok dengan filter ini.</p>}
        {recentActivity.map((h) => (
          <div key={h.id} className="list-row clickable-row" onClick={() => setSelectedActivity(h)}>
            <span>{h.outletName}</span>
            <span className="row" style={{ gap: 8 }}>
              <span className={`badge ${STATUS_BADGE[h.status] || 'gray'}`}>{h.status}</span>
              <span className="muted">{timeAgo(h.createdAt)}</span>
            </span>
          </div>
        ))}
        {filteredActivity.length > activityLimit && (
          <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
            Menampilkan {recentActivity.length} dari {filteredActivity.length} — ubah "baris" di atas buat lihat lebih banyak.
          </p>
        )}
        {activityDateFilter === '30D' && history.length >= 200 && (
          <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
            Dihitung dari 200 pengiriman terakhir — kalau volume kirim kamu tinggi, "30 hari terakhir" di sini mungkin
            belum mewakili sebulan penuh.
          </p>
        )}
      </div>

      {selectedActivity && (
        <div className="modal-overlay" onClick={() => setSelectedActivity(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Detail Aktivitas</h3>

            <div className="modal-field">
              <div className="modal-label">Outlet</div>
              <div className="modal-value">{selectedActivity.outletName}</div>
            </div>

            <div className="modal-field">
              <div className="modal-label">No. HP</div>
              <div className="modal-value">{selectedActivity.phone}</div>
            </div>

            {selectedActivity.templateName && (
              <div className="modal-field">
                <div className="modal-label">Template</div>
                <div className="modal-value">{selectedActivity.templateName}</div>
              </div>
            )}

            <div className="modal-field">
              <div className="modal-label">Status</div>
              <div className="modal-value">
                <span className={`badge ${STATUS_BADGE[selectedActivity.status] || 'gray'}`}>{selectedActivity.status}</span>
              </div>
            </div>

            {selectedActivity.error && (
              <div className="modal-field">
                <div className="modal-label">Error</div>
                <div className="modal-value muted">{selectedActivity.error}</div>
              </div>
            )}

            <div className="modal-field">
              <div className="modal-label">Waktu</div>
              <div className="modal-value">{new Date(selectedActivity.createdAt).toLocaleString('id-ID')}</div>
            </div>

            <div className="modal-field">
              <div className="modal-label">Isi Pesan</div>
              <div className="modal-value">{selectedActivity.message}</div>
            </div>

            <button className="secondary" style={{ width: '100%' }} onClick={() => setSelectedActivity(null)}>
              Tutup
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
