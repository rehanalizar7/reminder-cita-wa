const express = require('express');
const { eq, and, or, like, inArray, sql } = require('drizzle-orm');
const { db, schema } = require('../db');
const { requireAuth } = require('../auth/middleware');
const { normalizeIdPhone } = require('../utils/phone');

const router = express.Router();
router.use(requireAuth);

// GET /outlets?search=&groupId=&isActive=&limit=&offset=
router.get('/', async (req, res) => {
  const { search, groupId, isActive, limit, offset } = req.query;
  const reeId = req.ree.id;

  const conditions = [eq(schema.outlet.reeId, reeId)];
  if (isActive !== undefined) conditions.push(eq(schema.outlet.isActive, isActive === 'true'));
  if (search) {
    const term = `%${search}%`;
    conditions.push(or(like(schema.outlet.name, term), like(schema.outlet.phone, term)));
  }
  if (groupId) {
    const memberRows = await db
      .select({ outletId: schema.outletGroupMember.outletId })
      .from(schema.outletGroupMember)
      .where(eq(schema.outletGroupMember.groupId, String(groupId)));
    const ids = memberRows.map((m) => m.outletId);
    conditions.push(inArray(schema.outlet.id, ids.length ? ids : ['__none__']));
  }
  const where = and(...conditions);

  const take = Math.min(Number(limit) || 100, 500);
  const skip = Number(offset) || 0;

  const [items, totalRows] = await Promise.all([
    db.select().from(schema.outlet).where(where).orderBy(schema.outlet.name).limit(take).offset(skip),
    db.select({ count: sql`count(*)`.as('count') }).from(schema.outlet).where(where),
  ]);

  const outletIds = items.map((o) => o.id);
  let groupsByOutlet = {};
  if (outletIds.length) {
    const memberships = await db
      .select({
        outletId: schema.outletGroupMember.outletId,
        groupId: schema.outletGroup.id,
        groupName: schema.outletGroup.name,
      })
      .from(schema.outletGroupMember)
      .innerJoin(schema.outletGroup, eq(schema.outletGroup.id, schema.outletGroupMember.groupId))
      .where(inArray(schema.outletGroupMember.outletId, outletIds));

    groupsByOutlet = memberships.reduce((acc, m) => {
      (acc[m.outletId] ||= []).push({ id: m.groupId, name: m.groupName });
      return acc;
    }, {});
  }

  res.json({
    total: Number(totalRows[0]?.count || 0),
    items: items.map((o) => ({ ...o, groups: groupsByOutlet[o.id] || [] })),
  });
});

router.patch('/:id', async (req, res) => {
  const [existing] = await db.select().from(schema.outlet).where(eq(schema.outlet.id, req.params.id));
  if (!existing || existing.reeId !== req.ree.id) return res.status(404).json({ error: 'Outlet tidak ditemukan' });

  const { name, phone, notes, isActive, citaLoginPhone, citaRetailerId } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name;
  if (notes !== undefined) data.notes = notes;
  if (isActive !== undefined) data.isActive = Boolean(isActive);
  if (phone !== undefined) {
    const normalized = normalizeIdPhone(phone);
    if (!normalized) return res.status(400).json({ error: 'Nomor HP tidak valid' });
    data.phone = normalized;
  }
  if (citaLoginPhone !== undefined) {
    if (citaLoginPhone === null || citaLoginPhone === '') {
      // REE ngosongin lagi nomor login CITA -- lepas juga referensi ke
      // citaRetailer-nya biar gak nyisa nyantol ke pilihan lama.
      data.citaLoginPhone = null;
      data.citaRetailerId = null;
    } else {
      const normalized = normalizeIdPhone(citaLoginPhone);
      data.citaLoginPhone = normalized || citaLoginPhone; // fallback: simpen mentah kalau REE ketik format aneh
      // citaRetailerId cuma keisi kalau body eksplisit ngirim (REE milih dari
      // hasil cari); kalau REE ketik manual, citaRetailerId dikosongin biar
      // gak nyantol ke baris referensi yang gak sesuai.
      data.citaRetailerId = citaRetailerId || null;
    }
  } else if (citaRetailerId !== undefined) {
    data.citaRetailerId = citaRetailerId || null;
  }

  try {
    const [updated] = await db.update(schema.outlet).set(data).where(eq(schema.outlet.id, req.params.id)).returning();
    res.json(updated);
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) return res.status(409).json({ error: 'Nomor sudah dipakai outlet lain' });
    throw err;
  }
});

// Replace an outlet's group memberships wholesale.
router.post('/:id/groups', async (req, res) => {
  const [existing] = await db.select().from(schema.outlet).where(eq(schema.outlet.id, req.params.id));
  if (!existing || existing.reeId !== req.ree.id) return res.status(404).json({ error: 'Outlet tidak ditemukan' });

  const { groupIds } = req.body || {};
  if (!Array.isArray(groupIds)) return res.status(400).json({ error: 'groupIds harus array' });

  db.transaction((tx) => {
    tx.delete(schema.outletGroupMember).where(eq(schema.outletGroupMember.outletId, req.params.id)).run();
    if (groupIds.length) {
      tx.insert(schema.outletGroupMember)
        .values(groupIds.map((groupId) => ({ outletId: req.params.id, groupId })))
        .onConflictDoNothing()
        .run();
    }
  });

  res.json({ ok: true });
});

module.exports = router;
