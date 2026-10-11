// Logika "tim" SPV + statistik pemantauan per akun (dipakai halaman SPV dan
// ringkasan admin). Semua query di sini pakai handle `sqlite` mentah, jadi
// kolom timestamp WAJIB dibandingkan dalam UNIX SECONDS (lihat catatan di
// services/safety.js), bukan milidetik.
const { sqlite } = require('../db');
const { getStatus } = require('../wa/sessionManager');
const { computeSafetyReport } = require('./safety');

const DAY_SEC = 24 * 60 * 60;

// 00:00 WIB hari ini, dalam UNIX seconds.
function startOfTodayJakartaSec() {
  const OFFSET = 7 * 60 * 60;
  const nowSec = Math.floor(Date.now() / 1000);
  return Math.floor((nowSec + OFFSET) / DAY_SEC) * DAY_SEC - OFFSET;
}

function placeholders(n) {
  return new Array(n).fill('?').join(',');
}

// TSUB yang dipegang SPV ini.
function getSpvTsubs(spvId) {
  return sqlite
    .prepare(
      `SELECT t.id, t.code, t.outlet_count AS outletCount
       FROM spv_tsub st JOIN tsub t ON t.id = st.tsub_id
       WHERE st.spv_id = ?
       ORDER BY t.code`
    )
    .all(spvId);
}

// REE yang TSUB-nya dipegang SPV ini. Patokannya tsub.assigned_ree_id (sumber
// kebenaran klaim TSUB) DAN ree.tsub_id harus sama -- baris yang gak konsisten
// gak dianggap anggota tim, biar SPV gak sampai ngirim ke outlet REE yang salah.
// REE nonaktif tetap ikut (ditandai isActive=false) supaya SPV bisa "nge-cover"
// outlet REE yang lagi gak aktif.
function getTeamMembers(spvId) {
  return sqlite
    .prepare(
      `SELECT r.id, r.name, r.username, r.is_active AS isActive, t.id AS tsubId, t.code AS tsubCode
       FROM spv_tsub st
       JOIN tsub t ON t.id = st.tsub_id
       JOIN ree r ON r.id = t.assigned_ree_id AND r.tsub_id = t.id AND r.role = 'ree'
       WHERE st.spv_id = ?
       ORDER BY t.code`
    )
    .all(spvId)
    .map((m) => ({ ...m, isActive: Boolean(m.isActive) }));
}

function getTeamReeIds(spvId) {
  return getTeamMembers(spvId).map((m) => m.id);
}

// "Wilayah kirim" sebuah akun: daftar pemilik outlet (ree_id) yang boleh dia
// kirimi reminder. REE = outlet miliknya sendiri; SPV = outlet milik REE timnya.
function getScopeReeIds(user) {
  if (!user) return [];
  if (user.role === 'spv') return getTeamReeIds(user.id);
  return [user.id];
}

function isInScope(user, reeId) {
  return getScopeReeIds(user).includes(reeId);
}

// Statistik pemantauan buat sekumpulan akun (REE/SPV). Balikin array dengan
// urutan sama seperti `ids`.
async function accountStats(ids, { withSafety = true } = {}) {
  if (!ids.length) return [];
  const ph = placeholders(ids.length);
  const today = startOfTodayJakartaSec();
  const since7d = Math.floor(Date.now() / 1000) - 7 * DAY_SEC;

  const base = sqlite
    .prepare(
      `SELECT r.id, r.name, r.username, r.role, r.is_active AS isActive,
              r.wa_phone_number AS waPhoneNumber, r.wa_connected AS waConnectedDb,
              t.code AS tsubCode
       FROM ree r LEFT JOIN tsub t ON t.id = r.tsub_id
       WHERE r.id IN (${ph})`
    )
    .all(...ids);

  const outlets = sqlite
    .prepare(
      `SELECT ree_id AS reeId, COUNT(*) AS total, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
       FROM outlet WHERE ree_id IN (${ph}) GROUP BY ree_id`
    )
    .all(...ids);

  const logs = sqlite
    .prepare(
      `SELECT ree_id AS reeId,
              SUM(CASE WHEN status = 'SENT' AND sent_at >= ? THEN 1 ELSE 0 END) AS sentToday,
              SUM(CASE WHEN status = 'FAILED' AND created_at >= ? THEN 1 ELSE 0 END) AS failedToday,
              SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending7d,
              SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) AS sent7d,
              SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed7d
       FROM message_log
       WHERE ree_id IN (${ph}) AND created_at >= ?
       GROUP BY ree_id`
    )
    .all(today, today, ...ids, since7d);

  const last = sqlite
    .prepare(
      `SELECT ree_id AS reeId, MAX(COALESCE(sent_at, created_at)) AS lastSentAt
       FROM message_log WHERE ree_id IN (${ph}) AND status = 'SENT' GROUP BY ree_id`
    )
    .all(...ids);

  const byId = (rows) => Object.fromEntries(rows.map((r) => [r.reeId, r]));
  const baseById = Object.fromEntries(base.map((r) => [r.id, r]));
  const outletsById = byId(outlets);
  const logsById = byId(logs);
  const lastById = byId(last);

  const result = [];
  for (const id of ids) {
    const b = baseById[id];
    if (!b) continue;
    const o = outletsById[id] || {};
    const l = logsById[id] || {};
    const live = getStatus(id).status;

    let safety = null;
    if (withSafety) {
      try {
        const rep = await computeSafetyReport(id);
        safety = { level: rep.level, score: rep.score, summary: rep.summary };
      } catch {
        safety = null; // gak krusial -- jangan gagalin seluruh daftar
      }
    }

    result.push({
      id,
      name: b.name,
      username: b.username,
      role: b.role,
      isActive: Boolean(b.isActive),
      tsubCode: b.tsubCode || null,
      waStatus: live, // status sesi live di memori: 'open' | 'qr' | 'connecting' | 'closed'
      waConnected: live === 'open',
      waPhoneNumber: b.waPhoneNumber || null,
      outletsTotal: Number(o.total || 0),
      outletsActive: Number(o.active || 0),
      sentToday: Number(l.sentToday || 0),
      failedToday: Number(l.failedToday || 0),
      pending7d: Number(l.pending7d || 0),
      sent7d: Number(l.sent7d || 0),
      failed7d: Number(l.failed7d || 0),
      lastSentAt: lastById[id]?.lastSentAt ? new Date(lastById[id].lastSentAt * 1000).toISOString() : null,
      safety,
    });
  }
  return result;
}

module.exports = {
  startOfTodayJakartaSec,
  getSpvTsubs,
  getTeamMembers,
  getTeamReeIds,
  getScopeReeIds,
  isInScope,
  accountStats,
};
