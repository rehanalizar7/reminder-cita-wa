import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useMe } from '../../lib/me.jsx';
import { WaStatusCard, SafetyCard } from '../../components/WaPanel.jsx';
import { attentionReasons } from '../../components/AccountStats.jsx';
import { MemberModal } from './SpvTeam.jsx';

function isToday(iso) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function SpvDashboard() {
  const { me } = useMe();
  const [team, setTeam] = useState(null);
  const [myHistory, setMyHistory] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    Promise.all([api.spvTeam(), api.sendHistory({ limit: 200 })])
      .then(([t, h]) => {
        setTeam(t);
        setMyHistory(h);
      })
      .catch((err) => setError(err.message));
  }, []);

  const members = team?.members || [];
  const totalOutlets = members.reduce((n, m) => n + m.outletsActive, 0);
  const teamSentToday = members.reduce((n, m) => n + m.sentToday, 0);
  const waOn = members.filter((m) => m.waConnected).length;
  const mySentToday = myHistory.filter((h) => h.status === 'SENT' && isToday(h.sentAt || h.createdAt)).length;
  const myFailedToday = myHistory.filter((h) => h.status === 'FAILED' && isToday(h.createdAt)).length;
  const needAttention = members
    .map((m) => ({ m, reasons: attentionReasons(m) }))
    .filter((x) => x.reasons.length > 0);

  return (
    <div>
      <h2>Dashboard SPV</h2>
      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <div className="row between wrap">
          <div>
            <div className="muted">Login sebagai</div>
            <div style={{ fontWeight: 600 }}>{me?.name}</div>
            <div className="muted">Supervisor</div>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {(me?.spvTsubs || []).map((t) => (
              <span key={t.id} className="badge gray">
                {t.code}
              </span>
            ))}
          </div>
        </div>
        {me && me.spvTsubs.length === 0 && (
          <div className="warn-box" style={{ marginTop: 12, marginBottom: 0 }}>
            Kamu belum pegang TSUB mana pun. Minta admin atur TSUB untuk akun SPV kamu dulu.
          </div>
        )}
      </div>

      <WaStatusCard description="Hubungkan nomor WhatsApp kamu sendiri. Reminder dari SPV ke outlet tim dikirim lewat nomor ini, dan dihitung ke batas kirim harian nomor ini." />

      <SafetyCard />

      <div className="card">
        <div className="row between wrap" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Ringkasan Tim</h3>
          <Link to="/tim">Lihat detail tim →</Link>
        </div>
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-value">{members.length}</div>
            <div className="stat-label">REE di tim</div>
          </div>
          <div className="stat-tile stat-ok">
            <div className="stat-value">
              {waOn}/{members.length}
            </div>
            <div className="stat-label">WA REE terhubung</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{totalOutlets}</div>
            <div className="stat-label">Outlet aktif tim</div>
          </div>
          <div className="stat-tile stat-ok">
            <div className="stat-value">{teamSentToday}</div>
            <div className="stat-label">Dikirim REE hari ini</div>
          </div>
          <div className="stat-tile stat-ok">
            <div className="stat-value">{mySentToday}</div>
            <div className="stat-label">Dikirim kamu hari ini</div>
          </div>
          <div className="stat-tile stat-danger">
            <div className="stat-value">{myFailedToday}</div>
            <div className="stat-label">Kiriman kamu gagal</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Perlu Perhatian</h3>
        {!team && !error && <p className="muted">Memuat...</p>}
        {team && needAttention.length === 0 && <p className="muted">Semua REE aman, gak ada yang perlu dikejar.</p>}
        {needAttention.map(({ m, reasons }) => (
          <div key={m.id} className="list-row clickable-row" onClick={() => setSelected(m)}>
            <span>
              <strong>{m.name}</strong> <span className="muted">{m.tsubCode}</span>
            </span>
            <span className="muted" style={{ textAlign: 'right' }}>
              {reasons.join(' · ')}
            </span>
          </div>
        ))}
      </div>

      {selected && <MemberModal member={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
