const express = require('express');
const { sqlite } = require('../db');
const { requireAuth, requireRole } = require('../auth/middleware');
const { getSpvTsubs, getTeamMembers, accountStats } = require('../services/team');

const router = express.Router();
router.use(requireAuth, requireRole('spv'));

const LOG_STATUSES = ['PENDING', 'SENT', 'FAILED'];

function ph(n) {
  return new Array(n).fill('?').join(',');
}

// GET /spv/team -- TSUB yang dipegang SPV + statistik tiap REE di dalamnya.
router.get('/team', async (req, res) => {
  const tsubs = getSpvTsubs(req.ree.id);
  const members = getTeamMembers(req.ree.id);
  const memberByTsub = Object.fromEntries(members.map((m) => [m.tsubId, m]));
  const stats = await accountStats(members.map((m) => m.id));

  res.json({
    tsubs: tsubs.map((t) => ({
      id: t.id,
      code: t.code,
      outletCount: t.outletCount,
      ree: memberByTsub[t.id]
        ? { id: memberByTsub[t.id].id, name: memberByTsub[t.id].name, username: memberByTsub[t.id].username }
        : null,
    })),
    members: stats,
  });
});

// GET /spv/team/:reeId/history?limit=&status= -- riwayat kirim REE tim tertentu.
router.get('/team/:reeId/history', (req, res) => {
  const member = getTeamMembers(req.ree.id).find((m) => m.id === req.params.reeId);
  if (!member) return res.status(404).json({ error: 'REE ini bukan bagian dari tim kamu' });

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const status = LOG_STATUSES.includes(String(req.query.status)) ? String(req.query.status) : null;

  const rows = sqlite
    .prepare(
      `SELECT l.id, l.phone, l.message, l.status, l.error, l.created_at AS createdAt, l.sent_at AS sentAt,
              o.name AS outletName, t.name AS templateName
       FROM message_log l
       JOIN outlet o ON o.id = l.outlet_id
       LEFT JOIN message_template t ON t.id = l.template_id
       WHERE l.ree_id = ? ${status ? 'AND l.status = ?' : ''}
       ORDER BY l.created_at DESC
       LIMIT ?`
    )
    .all(...[member.id, ...(status ? [status] : []), limit]);

  const toIso = (sec) => (sec ? new Date(sec * 1000).toISOString() : null);
  res.json(rows.map((r) => ({ ...r, createdAt: toIso(r.createdAt), sentAt: toIso(r.sentAt) })));
});

// GET /spv/outlets?reeId=&search=&isActive=&limit=&offset=
// Outlet milik REE di tim SPV (read-only -- yang ngedit tetap REE pemiliknya).
router.get('/outlets', (req, res) => {
  const members = getTeamMembers(req.ree.id);
  let ids = members.map((m) => m.id);
  if (req.query.reeId) ids = ids.filter((id) => id === String(req.query.reeId));
  if (!ids.length) return res.json({ total: 0, items: [] });

  const where = [`o.ree_id IN (${ph(ids.length)})`];
  const params = [...ids];
  if (req.query.isActive === 'true' || req.query.isActive === 'false') {
    where.push('o.is_active = ?');
    params.push(req.query.isActive === 'true' ? 1 : 0);
  }
  const search = String(req.query.search || '').trim();
  if (search) {
    where.push('(o.name LIKE ? OR o.phone LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const whereSql = where.join(' AND ');
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 3000);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const total = sqlite.prepare(`SELECT COUNT(*) AS n FROM outlet o WHERE ${whereSql}`).get(...params).n;
  const items = sqlite
    .prepare(
      `SELECT o.id, o.name, o.phone, o.is_active AS isActive, o.cita_login_phone AS citaLoginPhone, o.notes,
              o.ree_id AS reeId, r.name AS ownerName, t.code AS tsubCode
       FROM outlet o
       JOIN ree r ON r.id = o.ree_id
       LEFT JOIN tsub t ON t.id = r.tsub_id
       WHERE ${whereSql}
       ORDER BY t.code, o.name
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset)
    .map((o) => ({ ...o, isActive: Boolean(o.isActive) }));

  res.json({ total, items });
});

// GET /spv/groups -- grup milik REE tim (buat target "per grup").
// outletCount = jumlah outlet AKTIF di grup (yang beneran bakal dikirimi).
router.get('/groups', (req, res) => {
  const ids = getTeamMembers(req.ree.id).map((m) => m.id);
  if (!ids.length) return res.json([]);
  const rows = sqlite
    .prepare(
      `SELECT g.id, g.name, g.ree_id AS reeId, r.name AS ownerName,
              COUNT(CASE WHEN o.is_active = 1 THEN 1 END) AS outletCount
       FROM outlet_group g
       JOIN ree r ON r.id = g.ree_id
       LEFT JOIN outlet_group_member m ON m.group_id = g.id
       LEFT JOIN outlet o ON o.id = m.outlet_id
       WHERE g.ree_id IN (${ph(ids.length)})
       GROUP BY g.id
       ORDER BY r.name, g.name`
    )
    .all(...ids);
  res.json(rows.map((g) => ({ ...g, outletCount: Number(g.outletCount) })));
});

module.exports = router;
