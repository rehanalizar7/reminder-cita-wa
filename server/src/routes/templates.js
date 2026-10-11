const express = require('express');
const { eq, or, isNull, desc } = require('drizzle-orm');
const { db, schema } = require('../db');
const { requireAuth } = require('../auth/middleware');
const { AVAILABLE_PLACEHOLDERS } = require('../utils/template');
const { deleteTemplateSafely } = require('../services/templateDelete');

const router = express.Router();
router.use(requireAuth);

// Every REE sees their own templates plus any shared (reeId=null) ones.
router.get('/', async (req, res) => {
  const templates = await db
    .select()
    .from(schema.messageTemplate)
    .where(or(eq(schema.messageTemplate.reeId, req.ree.id), isNull(schema.messageTemplate.reeId)))
    .orderBy(desc(schema.messageTemplate.updatedAt));
  res.json({ templates, availablePlaceholders: AVAILABLE_PLACEHOLDERS });
});

router.post('/', async (req, res) => {
  const { name, body } = req.body || {};
  if (!String(name || '').trim() || !String(body || '').trim()) {
    return res.status(400).json({ error: 'Nama dan isi template wajib diisi' });
  }
  const [template] = await db
    .insert(schema.messageTemplate)
    .values({ reeId: req.ree.id, name: String(name).trim(), body: String(body) })
    .returning();
  res.status(201).json(template);
});

router.put('/:id', async (req, res) => {
  const [existing] = await db.select().from(schema.messageTemplate).where(eq(schema.messageTemplate.id, req.params.id));
  if (!existing || existing.reeId !== req.ree.id) {
    return res.status(404).json({ error: 'Template tidak ditemukan' });
  }
  const { name, body } = req.body || {};
  const data = {};
  if (String(name || '').trim()) data.name = String(name).trim();
  if (String(body || '').trim()) data.body = String(body);
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Nama atau isi template wajib diisi' });
  const [updated] = await db
    .update(schema.messageTemplate)
    .set(data)
    .where(eq(schema.messageTemplate.id, req.params.id))
    .returning();
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const [existing] = await db.select().from(schema.messageTemplate).where(eq(schema.messageTemplate.id, req.params.id));
  if (!existing || existing.reeId !== req.ree.id) {
    return res.status(404).json({ error: 'Template tidak ditemukan' });
  }
  const result = deleteTemplateSafely(existing.id);
  if (!result.ok) return res.status(409).json({ error: result.error });
  res.json({ ok: true });
});

module.exports = router;
