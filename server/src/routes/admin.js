const express = require('express');
const bcrypt = require('bcryptjs');
const { eq, asc } = require('drizzle-orm');
const { db, schema } = require('../db');
const { requireAuth, requireAdmin } = require('../auth/middleware');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// GET /admin/users — list semua akun REE dengan info ringkasan
router.get('/users', wrap(async (req, res) => {
  const rows = await db
    .select({
      id: schema.ree.id,
      name: schema.ree.name,
      username: schema.ree.username,
      email: schema.ree.email,
      role: schema.ree.role,
      isActive: schema.ree.isActive,
      mustChangePassword: schema.ree.mustChangePassword,
      waConnected: schema.ree.waConnected,
      waPhoneNumber: schema.ree.waPhoneNumber,
      tsubId: schema.ree.tsubId,
      tsubCode: schema.tsub.code,
      createdAt: schema.ree.createdAt,
    })
    .from(schema.ree)
    .leftJoin(schema.tsub, eq(schema.tsub.id, schema.ree.tsubId))
    .orderBy(asc(schema.ree.name));
  res.json(rows);
}));

// POST /admin/users — buat akun REE baru
// Body: { name, username, password, email? }
router.post('/users', wrap(async (req, res) => {
  const { name, username, password, email } = req.body || {};
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'name, username, dan password wajib diisi' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }

  const uname = username.trim().toLowerCase();

  // Cek duplikat username
  const [existing] = await db.select({ id: schema.ree.id }).from(schema.ree).where(eq(schema.ree.username, uname));
  if (existing) return res.status(409).json({ error: 'Username sudah dipakai' });

  // Cek duplikat email (kalau diberikan)
  if (email) {
    const [existingEmail] = await db.select({ id: schema.ree.id }).from(schema.ree).where(eq(schema.ree.email, email.trim()));
    if (existingEmail) return res.status(409).json({ error: 'Email sudah terdaftar' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [ree] = await db
    .insert(schema.ree)
    .values({
      name: name.trim(),
      username: uname,
      email: email ? email.trim() : `${uname}@local`,
      passwordHash,
      mustChangePassword: true,
      role: 'ree',
      isActive: true,
    })
    .returning();

  const { passwordHash: _h, ...safe } = ree;
  res.status(201).json(safe);
}));

// POST /admin/users/:id/reset-password — reset password, set must_change_password = true
// Body: { newPassword }
router.post('/users/:id/reset-password', wrap(async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }

  const [target] = await db.select().from(schema.ree).where(eq(schema.ree.id, req.params.id));
  if (!target) return res.status(404).json({ error: 'Akun tidak ditemukan' });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(schema.ree)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(schema.ree.id, req.params.id));

  res.json({ ok: true });
}));

// PATCH /admin/users/:id/active — aktifkan atau nonaktifkan akun
// Body: { isActive: boolean }
router.patch('/users/:id/active', wrap(async (req, res) => {
  const { isActive } = req.body || {};
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive harus boolean' });
  }

  const [target] = await db.select().from(schema.ree).where(eq(schema.ree.id, req.params.id));
  if (!target) return res.status(404).json({ error: 'Akun tidak ditemukan' });

  // Admin tidak bisa nonaktifkan dirinya sendiri
  if (target.id === req.ree.id && !isActive) {
    return res.status(400).json({ error: 'Tidak bisa menonaktifkan akun sendiri' });
  }

  const [updated] = await db
    .update(schema.ree)
    .set({ isActive })
    .where(eq(schema.ree.id, req.params.id))
    .returning();

  const { passwordHash: _h, ...safe } = updated;
  res.json(safe);
}));

module.exports = router;
