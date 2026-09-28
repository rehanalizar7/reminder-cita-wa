const express = require('express');
const { eq, sql } = require('drizzle-orm');
const { db, schema } = require('../db');
const { requireAuth } = require('../auth/middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const groups = await db
    .select({
      id: schema.outletGroup.id,
      name: schema.outletGroup.name,
      outletCount: sql`count(${schema.outletGroupMember.outletId})`.as('outletCount'),
    })
    .from(schema.outletGroup)
    .leftJoin(schema.outletGroupMember, eq(schema.outletGroupMember.groupId, schema.outletGroup.id))
    .where(eq(schema.outletGroup.reeId, req.ree.id))
    .groupBy(schema.outletGroup.id)
    .orderBy(schema.outletGroup.name);

  res.json(groups.map((g) => ({ ...g, outletCount: Number(g.outletCount) })));
});

router.post('/', async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nama grup wajib diisi' });
  try {
    const [group] = await db.insert(schema.outletGroup).values({ reeId: req.ree.id, name: name.trim() }).returning();
    res.status(201).json(group);
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) return res.status(409).json({ error: 'Nama grup sudah dipakai' });
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const [existing] = await db.select().from(schema.outletGroup).where(eq(schema.outletGroup.id, req.params.id));
  if (!existing || existing.reeId !== req.ree.id) return res.status(404).json({ error: 'Grup tidak ditemukan' });
  const { name } = req.body || {};
  const [updated] = await db
    .update(schema.outletGroup)
    .set({ name })
    .where(eq(schema.outletGroup.id, req.params.id))
    .returning();
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const [existing] = await db.select().from(schema.outletGroup).where(eq(schema.outletGroup.id, req.params.id));
  if (!existing || existing.reeId !== req.ree.id) return res.status(404).json({ error: 'Grup tidak ditemukan' });
  await db.delete(schema.outletGroup).where(eq(schema.outletGroup.id, req.params.id));
  res.json({ ok: true });
});

module.exports = router;
