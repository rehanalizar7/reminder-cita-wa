const express = require('express');
const bcrypt = require('bcryptjs');
const { eq, sql, isNull, and, desc } = require('drizzle-orm');
const { db, sqlite, schema } = require('../db');
const { requireAuth, requireAdmin, ROLES } = require('../auth/middleware');
const { getStatus } = require('../wa/sessionManager');
const { accountStats } = require('../services/team');
const { assignReeToTsubTx, assignSpvToTsubTx, AssignError } = require('../services/tsubAssign');
const { deleteTemplateSafely } = require('../services/templateDelete');
const { AVAILABLE_PLACEHOLDERS } = require('../utils/template');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const TSUB_CODE_RE = /^[A-Z0-9_-]{2,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

function cleanUsername(v) {
  return String(v || '').trim().toLowerCase();
}

function cleanEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function stripSecrets(row) {
  if (!row) return row;
  const { passwordHash, googleRefreshToken, contactsGoogleRefreshToken, ...safe } = row;
  return safe;
}

function sendAssignError(res, err) {
  if (err instanceof AssignError) return res.status(err.status).json({ error: err.message });
  throw err;
}

function usernameTaken(username, exceptId = null) {
  const row = sqlite.prepare('SELECT id FROM ree WHERE username = ?').get(username);
  return Boolean(row && row.id !== exceptId);
}

function emailTaken(email, exceptId = null) {
  const row = sqlite.prepare('SELECT id FROM ree WHERE lower(trim(email)) = ?').get(email);
  return Boolean(row && row.id !== exceptId);
}

function activeAdminCount(exceptId = null) {
  return sqlite
    .prepare("SELECT COUNT(*) AS n FROM ree WHERE role = 'admin' AND is_active = 1 AND id != ?")
    .get(exceptId || '').n;
}

function spvTsubCount(userId) {
  return sqlite.prepare('SELECT COUNT(*) AS n FROM spv_tsub WHERE spv_id = ?').get(userId).n;
}

// ─── Ringkasan ───────────────────────────────────────────────────────────────

// GET /admin/overview -- angka ringkas + statistik tiap akun REE & SPV.
router.get('/overview', async (req, res) => {
  const counts = sqlite
    .prepare(
      `SELECT
         SUM(CASE WHEN role = 'ree' THEN 1 ELSE 0 END) AS ree,
         SUM(CASE WHEN role = 'spv' THEN 1 ELSE 0 END) AS spv,
         SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admin,
         SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive
       FROM ree`
    )
    .get();
  const tsub = sqlite
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN assigned_ree_id IS NOT NULL THEN 1 ELSE 0 END) AS withRee,
              SUM(CASE WHEN id IN (SELECT tsub_id FROM spv_tsub) THEN 1 ELSE 0 END) AS withSpv
       FROM tsub`
    )
    .get();

  const ids = sqlite
    .prepare("SELECT id FROM ree WHERE role IN ('ree', 'spv') ORDER BY role DESC, name")
    .all()
    .map((r) => r.id);
  const accounts = await accountStats(ids);

  res.json({
    counts: {
      ree: Number(counts.ree || 0),
      spv: Number(counts.spv || 0),
      admin: Number(counts.admin || 0),
      inactive: Number(counts.inactive || 0),
      waConnected: accounts.filter((a) => a.waConnected).length,
    },
    tsub: {
      total: Number(tsub.total || 0),
      withRee: Number(tsub.withRee || 0),
      withSpv: Number(tsub.withSpv || 0),
    },
    accounts,
  });
});

// ─── Akun ────────────────────────────────────────────────────────────────────

// GET /admin/users -- semua akun + TSUB-nya (REE) / TSUB yang dipegang (SPV).
router.get('/users', (req, res) => {
  const rows = sqlite
    .prepare(
      `SELECT r.id, r.name, r.username, r.email, r.role, r.is_active AS isActive,
              r.must_change_password AS mustChangePassword, r.wa_phone_number AS waPhoneNumber,
              r.google_id IS NOT NULL AS hasGoogle, r.tsub_id AS tsubId, t.code AS tsubCode, r.created_at AS createdAt
       FROM ree r LEFT JOIN tsub t ON t.id = r.tsub_id
       ORDER BY CASE r.role WHEN 'admin' THEN 0 WHEN 'spv' THEN 1 ELSE 2 END, r.name`
    )
    .all();
  const spvRows = sqlite
    .prepare('SELECT st.spv_id AS spvId, t.id, t.code FROM spv_tsub st JOIN tsub t ON t.id = st.tsub_id ORDER BY t.code')
    .all();
  const spvTsubs = {};
  for (const r of spvRows) (spvTsubs[r.spvId] ||= []).push({ id: r.id, code: r.code });

  res.json(
    rows.map((r) => ({
      ...r,
      isActive: Boolean(r.isActive),
      mustChangePassword: Boolean(r.mustChangePassword),
      hasGoogle: Boolean(r.hasGoogle),
      waConnected: getStatus(r.id).status === 'open',
      spvTsubs: spvTsubs[r.id] || [],
      createdAt: r.createdAt ? new Date(r.createdAt * 1000).toISOString() : null,
    }))
  );
});

// POST /admin/users -- buat akun baru
// Body: { name, username, password, email?, role?: 'ree'|'spv'|'admin', tsubId? (khusus REE) }
router.post('/users', async (req, res) => {
  const { name, username, password, email, role = 'ree', tsubId } = req.body || {};
  const cleanName = String(name || '').trim();
  const uname = cleanUsername(username);
  const mail = cleanEmail(email);

  if (!cleanName || !uname || !password) {
    return res.status(400).json({ error: 'Nama, username, dan password wajib diisi' });
  }
  if (cleanName.length > 80) return res.status(400).json({ error: 'Nama maksimal 80 karakter' });
  if (!USERNAME_RE.test(uname)) {
    return res.status(400).json({ error: 'Username 3-32 karakter: huruf kecil, angka, titik, strip, atau garis bawah' });
  }
  if (String(password).length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Role tidak valid' });
  if (mail && !EMAIL_RE.test(mail)) return res.status(400).json({ error: 'Format email tidak valid' });
  if (tsubId && role !== 'ree') return res.status(400).json({ error: 'TSUB langsung cuma bisa di-set untuk akun REE' });

  if (usernameTaken(uname)) return res.status(409).json({ error: 'Username sudah dipakai' });
  const finalEmail = mail || `${uname}@local`;
  if (emailTaken(finalEmail)) return res.status(409).json({ error: 'Email sudah terdaftar' });

  const passwordHash = await bcrypt.hash(String(password), 12);

  let created;
  try {
    created = sqlite.transaction(() => {
      const row = db
        .insert(schema.ree)
        .values({
          name: cleanName,
          username: uname,
          email: finalEmail,
          passwordHash,
          mustChangePassword: true,
          role,
          isActive: true,
        })
        .returning()
        .get();
      if (tsubId) assignReeToTsubTx(String(tsubId), row.id);
      // Baca ulang: kalau TSUB barusan di-set, `row` masih nyimpen tsubId lama (null).
      return db.select().from(schema.ree).where(eq(schema.ree.id, row.id)).get();
    })();
  } catch (err) {
    if (err instanceof AssignError) return res.status(err.status).json({ error: err.message });
    if (String(err.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username atau email sudah dipakai' });
    }
    throw err;
  }

  res.status(201).json(stripSecrets(created));
});

// PATCH /admin/users/:id -- ubah nama, username, email, atau role.
router.patch('/users/:id', (req, res) => {
  const target = sqlite.prepare('SELECT * FROM ree WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Akun tidak ditemukan' });

  const body = req.body || {};
  const set = {};

  if (body.name !== undefined) {
    const v = String(body.name || '').trim();
    if (!v) return res.status(400).json({ error: 'Nama wajib diisi' });
    if (v.length > 80) return res.status(400).json({ error: 'Nama maksimal 80 karakter' });
    set.name = v;
  }

  if (body.username !== undefined) {
    const v = cleanUsername(body.username);
    if (!USERNAME_RE.test(v)) {
      return res.status(400).json({ error: 'Username 3-32 karakter: huruf kecil, angka, titik, strip, atau garis bawah' });
    }
    if (usernameTaken(v, target.id)) return res.status(409).json({ error: 'Username sudah dipakai' });
    set.username = v;
  }

  if (body.email !== undefined) {
    let v = cleanEmail(body.email);
    if (v && !EMAIL_RE.test(v)) return res.status(400).json({ error: 'Format email tidak valid' });
    if (!v) v = `${set.username || target.username || target.id}@local`;
    if (emailTaken(v, target.id)) return res.status(409).json({ error: 'Email sudah terdaftar di akun lain' });
    set.email = v;
  }

  let pauseSchedules = false;
  if (body.role !== undefined && body.role !== target.role) {
    const newRole = body.role;
    if (!ROLES.includes(newRole)) return res.status(400).json({ error: 'Role tidak valid' });
    if (target.id === req.ree.id) return res.status(400).json({ error: 'Gak bisa mengubah role akun sendiri' });
    if (target.role === 'admin' && target.is_active && activeAdminCount(target.id) === 0) {
      return res.status(400).json({ error: 'Ini admin aktif terakhir. Buat/aktifkan admin lain dulu.' });
    }

    const holdsReeTsub = Boolean(target.tsub_id);
    const holdsSpvTsub = spvTsubCount(target.id) > 0;
    if (newRole === 'ree' && holdsSpvTsub) {
      return res.status(400).json({ error: 'Akun ini masih pegang TSUB sebagai SPV. Lepas dulu di halaman TSUB.' });
    }
    if (newRole === 'spv' && holdsReeTsub) {
      return res.status(400).json({ error: 'Akun ini masih pegang TSUB sebagai REE. Lepas dulu di halaman TSUB.' });
    }
    if (newRole === 'admin' && (holdsReeTsub || holdsSpvTsub)) {
      return res.status(400).json({ error: 'Admin gak boleh pegang TSUB. Lepas dulu semua TSUB akun ini di halaman TSUB.' });
    }
    set.role = newRole;

    // Wilayah kirim berubah kalau pindah dari/ke SPV (outlet sendiri <-> outlet
    // tim), dan admin gak boleh kirim. Jadwal lama dinonaktifkan biar gak
    // diam-diam ngirim ke sasaran yang beda dari maksud awalnya.
    pauseSchedules = target.role === 'spv' || newRole === 'spv' || newRole === 'admin';
  }

  if (!Object.keys(set).length) return res.status(400).json({ error: 'Gak ada perubahan yang dikirim' });

  let updated;
  let schedulesPaused = 0;
  try {
    // Satu transaksi: kalau update akun gagal (mis. UNIQUE), jadwal gak ikut ke-pause.
    sqlite.transaction(() => {
      [updated] = db.update(schema.ree).set(set).where(eq(schema.ree.id, target.id)).returning().all();
      if (pauseSchedules) {
        schedulesPaused = sqlite
          .prepare('UPDATE schedule_job SET is_active = 0 WHERE ree_id = ? AND is_active = 1')
          .run(target.id).changes;
      }
    })();
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) return res.status(409).json({ error: 'Username atau email sudah dipakai' });
    throw err;
  }
  res.json({ ...stripSecrets(updated), schedulesPaused });
});

// POST /admin/users/:id/reset-password — reset password, set must_change_password = true
// Body: { newPassword }
router.post('/users/:id/reset-password', async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }

  const [target] = await db.select({ id: schema.ree.id }).from(schema.ree).where(eq(schema.ree.id, req.params.id));
  if (!target) return res.status(404).json({ error: 'Akun tidak ditemukan' });

  const passwordHash = await bcrypt.hash(String(newPassword), 12);
  await db.update(schema.ree).set({ passwordHash, mustChangePassword: true }).where(eq(schema.ree.id, target.id));

  res.json({ ok: true });
});

// PATCH /admin/users/:id/active — aktifkan atau nonaktifkan akun
// Body: { isActive: boolean }
router.patch('/users/:id/active', async (req, res) => {
  const { isActive } = req.body || {};
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive harus boolean' });
  }

  const [target] = await db.select().from(schema.ree).where(eq(schema.ree.id, req.params.id));
  if (!target) return res.status(404).json({ error: 'Akun tidak ditemukan' });

  if (!isActive) {
    if (target.id === req.ree.id) return res.status(400).json({ error: 'Tidak bisa menonaktifkan akun sendiri' });
    if (target.role === 'admin' && activeAdminCount(target.id) === 0) {
      return res.status(400).json({ error: 'Ini admin aktif terakhir, gak bisa dinonaktifkan' });
    }
  }

  const [updated] = await db.update(schema.ree).set({ isActive }).where(eq(schema.ree.id, target.id)).returning();
  res.json(stripSecrets(updated));
});

// ─── TSUB ────────────────────────────────────────────────────────────────────

// GET /admin/tsubs -- semua TSUB + REE pemegang + SPV pemegang.
router.get('/tsubs', (req, res) => {
  const rows = sqlite
    .prepare(
      `SELECT t.id, t.code, t.outlet_count AS outletCount,
              (SELECT COUNT(*) FROM cita_retailer c WHERE c.tsub_id = t.id) AS retailerCount,
              r.id AS reeId, r.name AS reeName, r.username AS reeUsername, r.is_active AS reeActive,
              s.id AS spvId, s.name AS spvName
       FROM tsub t
       LEFT JOIN ree r ON r.id = t.assigned_ree_id
       LEFT JOIN spv_tsub st ON st.tsub_id = t.id
       LEFT JOIN ree s ON s.id = st.spv_id
       ORDER BY t.code`
    )
    .all();
  res.json(
    rows.map((r) => ({
      id: r.id,
      code: r.code,
      outletCount: r.outletCount,
      retailerCount: r.retailerCount,
      ree: r.reeId ? { id: r.reeId, name: r.reeName, username: r.reeUsername, isActive: Boolean(r.reeActive) } : null,
      spv: r.spvId ? { id: r.spvId, name: r.spvName } : null,
    }))
  );
});

// POST /admin/tsubs -- tambah kode TSUB baru (mis. wilayah baru yang belum ada di Excel).
router.post('/tsubs', (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!TSUB_CODE_RE.test(code)) {
    return res.status(400).json({ error: 'Kode TSUB 2-20 karakter: huruf, angka, strip, atau garis bawah (mis. TSUB060)' });
  }
  const exists = sqlite.prepare('SELECT id FROM tsub WHERE code = ?').get(code);
  if (exists) return res.status(409).json({ error: `Kode ${code} sudah ada` });
  const [created] = db.insert(schema.tsub).values({ code }).returning().all();
  res.status(201).json(created);
});

// PUT /admin/tsubs/:id/ree  Body: { reeId: string|null }
router.put('/tsubs/:id/ree', (req, res) => {
  const reeId = req.body?.reeId ? String(req.body.reeId) : null;
  try {
    const result = sqlite.transaction(() => assignReeToTsubTx(req.params.id, reeId))();
    res.json({ ok: true, ...result });
  } catch (err) {
    sendAssignError(res, err);
  }
});

// PUT /admin/tsubs/:id/spv  Body: { spvId: string|null }
router.put('/tsubs/:id/spv', (req, res) => {
  const spvId = req.body?.spvId ? String(req.body.spvId) : null;
  try {
    const result = sqlite.transaction(() => assignSpvToTsubTx(req.params.id, spvId))();
    res.json({ ok: true, ...result });
  } catch (err) {
    sendAssignError(res, err);
  }
});

// ─── Template bersama (reeId = NULL, kepakai semua REE & SPV) ───────────────

router.get('/templates', async (req, res) => {
  const templates = await db
    .select({
      id: schema.messageTemplate.id,
      name: schema.messageTemplate.name,
      body: schema.messageTemplate.body,
      updatedAt: schema.messageTemplate.updatedAt,
      scheduleCount: sql`(SELECT COUNT(*) FROM schedule_job WHERE template_id = ${schema.messageTemplate.id})`,
    })
    .from(schema.messageTemplate)
    .where(isNull(schema.messageTemplate.reeId))
    .orderBy(desc(schema.messageTemplate.updatedAt));
  res.json({
    templates: templates.map((t) => ({ ...t, scheduleCount: Number(t.scheduleCount) })),
    availablePlaceholders: AVAILABLE_PLACEHOLDERS,
  });
});

router.post('/templates', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const body = String(req.body?.body || '');
  if (!name || !body.trim()) return res.status(400).json({ error: 'Nama dan isi template wajib diisi' });
  const [created] = await db.insert(schema.messageTemplate).values({ reeId: null, name, body }).returning();
  res.status(201).json(created);
});

router.put('/templates/:id', async (req, res) => {
  const [existing] = await db
    .select()
    .from(schema.messageTemplate)
    .where(and(eq(schema.messageTemplate.id, req.params.id), isNull(schema.messageTemplate.reeId)));
  if (!existing) return res.status(404).json({ error: 'Template bersama tidak ditemukan' });
  const name = String(req.body?.name || '').trim();
  const body = String(req.body?.body || '');
  if (!name || !body.trim()) return res.status(400).json({ error: 'Nama dan isi template wajib diisi' });
  const [updated] = await db
    .update(schema.messageTemplate)
    .set({ name, body })
    .where(eq(schema.messageTemplate.id, existing.id))
    .returning();
  res.json(updated);
});

router.delete('/templates/:id', async (req, res) => {
  const [existing] = await db
    .select({ id: schema.messageTemplate.id })
    .from(schema.messageTemplate)
    .where(and(eq(schema.messageTemplate.id, req.params.id), isNull(schema.messageTemplate.reeId)));
  if (!existing) return res.status(404).json({ error: 'Template bersama tidak ditemukan' });
  const result = deleteTemplateSafely(existing.id);
  if (!result.ok) return res.status(409).json({ error: result.error });
  res.json({ ok: true });
});

module.exports = router;
