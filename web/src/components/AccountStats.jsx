import React from 'react';
import { SAFETY_BADGE, SAFETY_ICON, SAFETY_LABEL } from './WaPanel.jsx';
import { ROLE_LABEL } from '../lib/me.jsx';

export function timeAgo(iso) {
  if (!iso) return 'belum pernah';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'barusan';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

const WA_BADGE = {
  open: ['green', 'WA terhubung'],
  qr: ['yellow', 'Nunggu scan QR'],
  connecting: ['yellow', 'Menyambung'],
  closed: ['gray', 'WA putus'],
};

export function WaBadge({ status }) {
  const [color, label] = WA_BADGE[status] || WA_BADGE.closed;
  return <span className={`badge ${color}`}>{label}</span>;
}

export function SafetyBadge({ safety }) {
  if (!safety || safety.level === 'gray' || safety.score === null) return <span className="badge gray">—</span>;
  return (
    <span className={`badge ${SAFETY_BADGE[safety.level]}`} title={safety.summary}>
      {SAFETY_ICON[safety.level]} {safety.score}
    </span>
  );
}

// Hal yang perlu ditindaklanjuti dari statistik satu akun -- dipakai buat
// daftar "Perlu perhatian" di dashboard SPV & ringkasan admin.
export function attentionReasons(a) {
  const reasons = [];
  if (!a.isActive) return reasons; // akun nonaktif gak perlu dikejar
  if (!a.waConnected) reasons.push('WhatsApp belum terhubung');
  if (a.safety?.level === 'red') reasons.push(`Level keamanan nomor berisiko (${a.safety.score}/100)`);
  if (a.failedToday > 0) reasons.push(`${a.failedToday} pesan gagal hari ini`);
  if (a.role !== 'spv' && a.outletsActive === 0) reasons.push('Belum punya outlet aktif');
  if (a.sent7d === 0 && a.outletsActive > 0) reasons.push('Gak ada kiriman 7 hari terakhir');
  return reasons;
}

// Tabel statistik per akun (REE/SPV). Klik baris -> onRowClick(akun).
export function AccountStatsTable({ rows, onRowClick, showRole = false, emptyText = 'Belum ada data.' }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Nama</th>
          {showRole && <th className="col-hide-mobile">Role</th>}
          <th className="col-hide-mobile">TSUB</th>
          <th>WA</th>
          <th className="num col-hide-mobile">Outlet aktif</th>
          <th className="num">Kirim hari ini</th>
          <th className="num col-hide-mobile">Gagal hari ini</th>
          <th className="num col-hide-mobile">Kirim 7 hr</th>
          <th className="col-hide-mobile">Keamanan</th>
          <th className="col-hide-mobile">Terakhir kirim</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id} className={onRowClick ? 'clickable-row' : ''} onClick={() => onRowClick && onRowClick(a)}>
            <td>
              {a.name}
              {!a.isActive && <span className="badge red" style={{ marginLeft: 6 }}>nonaktif</span>}
              <div className="muted">{a.username || ''}</div>
            </td>
            {showRole && <td className="col-hide-mobile">{ROLE_LABEL[a.role] || a.role}</td>}
            <td className="col-hide-mobile nowrap">{a.tsubCode || '—'}</td>
            <td>
              <WaBadge status={a.waStatus} />
            </td>
            <td className="num col-hide-mobile">{a.role === 'spv' ? '—' : a.outletsActive}</td>
            <td className="num">{a.sentToday}</td>
            <td className="num col-hide-mobile" style={a.failedToday ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
              {a.failedToday}
            </td>
            <td className="num col-hide-mobile">{a.sent7d}</td>
            <td className="col-hide-mobile">
              <SafetyBadge safety={a.safety} />
            </td>
            <td className="muted col-hide-mobile nowrap">{timeAgo(a.lastSentAt)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={showRole ? 10 : 9} className="muted">
              {emptyText}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// Isi popup detail satu akun (statistik). `children` buat konten tambahan
// (mis. riwayat kirim di halaman SPV, tombol aksi di admin).
export function AccountStatsDetail({ a, children }) {
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <WaBadge status={a.waStatus} />
        {a.tsubCode && <span className="badge gray">{a.tsubCode}</span>}
        <span className="badge gray">{ROLE_LABEL[a.role] || a.role}</span>
        {!a.isActive && <span className="badge red">nonaktif</span>}
      </div>
      <div className="stat-grid" style={{ marginBottom: 14 }}>
        {a.role !== 'spv' && (
          <div className="stat-tile">
            <div className="stat-value">{a.outletsActive}</div>
            <div className="stat-label">Outlet aktif (dari {a.outletsTotal})</div>
          </div>
        )}
        <div className="stat-tile stat-ok">
          <div className="stat-value">{a.sentToday}</div>
          <div className="stat-label">Terkirim hari ini</div>
        </div>
        <div className="stat-tile stat-danger">
          <div className="stat-value">{a.failedToday}</div>
          <div className="stat-label">Gagal hari ini</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{a.sent7d}</div>
          <div className="stat-label">Terkirim 7 hari</div>
        </div>
        <div className="stat-tile stat-warn">
          <div className="stat-value">{a.pending7d}</div>
          <div className="stat-label">Masih antri</div>
        </div>
      </div>
      <div className="modal-field">
        <div className="modal-label">Nomor WA</div>
        <div className="modal-value">{a.waPhoneNumber || '—'}</div>
      </div>
      <div className="modal-field">
        <div className="modal-label">Level keamanan nomor</div>
        <div className="modal-value">
          {a.safety && a.safety.level !== 'gray' ? (
            <>
              <span className={`badge ${SAFETY_BADGE[a.safety.level]}`}>
                {SAFETY_ICON[a.safety.level]} {SAFETY_LABEL[a.safety.level]} · {a.safety.score}/100
              </span>{' '}
              <span className="muted">{a.safety.summary}</span>
            </>
          ) : (
            <span className="muted">Belum ada data</span>
          )}
        </div>
      </div>
      <div className="modal-field">
        <div className="modal-label">Terakhir kirim</div>
        <div className="modal-value">{a.lastSentAt ? new Date(a.lastSentAt).toLocaleString('id-ID') : 'Belum pernah'}</div>
      </div>
      {children}
    </>
  );
}
